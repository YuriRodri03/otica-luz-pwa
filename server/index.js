import express from 'express';
import cors from 'cors'; 
import { createClient } from '@libsql/client';
import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// ==========================================
// 1. CONFIGURAÇÕES GLOBAIS (MIDDLEWARES)
// ==========================================
app.use(express.json());
app.use(cors({
  origin: 'https://otica-luz.vercel.app', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const PORT = process.env.PORT || 8080;

// Conexão com o banco Turso (Limpa para evitar bugs de lote)
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
  disableMigrations: true, 
  introspect: "disabled"   
});

let whatsappClient = null; 
let statusConexao = 'Iniciando...'; 
let qrCodeBase64 = null;
let clientesEnviadosHoje = [];
let diaAtualGerenciamento = null;
let posVendasEnviadosHoje = [];
let diaAtualPosVendaGerenciamento = null;

// ==========================================
// 2. ROTAS DE CONTROLE PARA O FRONT-END (REACT)
// ==========================================

app.get('/api/whatsapp/status', (req, res) => {
  res.json({
    status: statusConexao,
    qr: qrCodeBase64 
  });
});

// Carrega os dados tratando de forma direta o retorno das linhas
app.get('/api/whatsapp/config-mensagens', async (req, res) => {
  try {
    const configs = { msg_aniversario: '', msg_pos_venda: '' };
    const r = await turso.execute("SELECT chave, valor FROM configuracoes");
    
    if (r && r.rows) {
      r.rows.forEach(row => {
        const chave = row.chave !== undefined ? row.chave : row[0];
        const valor = row.valor !== undefined ? row.valor : row[1];
        if (chave) configs[chave] = valor;
      });
    }
    res.json(configs);
  } catch (error) {
    console.error('⚠️ [Aviso GET] Falha ao ler banco:', error.message);
    res.json({ msg_aniversario: '', msg_pos_venda: '' });
  }
});

// Salva as configurações de mensagens de forma direta
app.post('/api/whatsapp/config-mensagens', async (req, res) => {
  try {
    const { msg_aniversario, msg_pos_venda } = req.body;
    await turso.execute({
      sql: "INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('msg_aniversario', ?)",
      args: [String(msg_aniversario || '').trim()]
    });
    await turso.execute({
      sql: "INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('msg_pos_venda', ?)",
      args: [String(msg_pos_venda || '').trim()]
    });
    res.json({ success: true, message: 'Modelos de mensagens salvos com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno ao salvar configurações', detalhes: error.message });
  }
});

app.post('/api/whatsapp/desconectar', async (req, res) => {
  if (!whatsappClient) return res.status(400).json({ error: 'WhatsApp não está ativo.' });
  try {
    statusConexao = 'Desconectando...';
    await whatsappClient.logout();
    statusConexao = 'Desconectado';
    qrCodeBase64 = null;
    whatsappClient = null;
    res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
    setTimeout(() => inicializarWhatsApp(), 3000);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => res.send('Servidor Ótica Luz Ativo com Baileys!'));

app.listen(PORT, () => {
  console.log(`🚀 Servidor HTTP rodando na porta ${PORT}`);
  inicializarWhatsApp();
});

// ==========================================
// 4. INICIALIZAÇÃO DO WHATSAPP (SESSÃO INFINITA DE ALTÍSSIMA PERFORMANCE)
// ==========================================

async function inicializarWhatsApp() {
  try {
    statusConexao = 'Iniciando motor...';
    
    // 1. Coleta a sessão completa estruturada (Creds + Chaves de criptografia profundas)
    const resSessao = await turso.execute("SELECT valor FROM configuracoes WHERE chave = 'whatsapp_full_session'");
    
    let dadosSessao = { creds: null, keys: {} };
    if (resSessao.rows && resSessao.rows[0]?.valor) {
      try {
        dadosSessao = JSON.parse(resSessao.rows[0].valor, (key, value) => {
          if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
            return Buffer.from(value.data);
          }
          return value;
        });
        console.log("📖 [Persistência Nível 2] Sessão criptográfica perpétua carregada do Turso.");
      } catch (e) {
        console.log("⚠️ Erro ao decodificar sessão completa, iniciando limpo...");
      }
    }

    const { initAuthCreds } = await import('@whiskeysockets/baileys');
    
    const creds = dadosSessao.creds || initAuthCreds();
    const chavesSalvas = dadosSessao.keys || {};
    
    // 🔥 ENGENHARIA PERPÉTUA: Intercepta e sincroniza dinamicamente as prekeys e locks do WebSocket
    const state = {
      creds: creds,
      keys: {
        get: (type, ids) => {
          const data = {};
          for (const id of ids) {
            if (chavesSalvas[type]?.[id]) {
              data[id] = chavesSalvas[type][id];
            }
          }
          return data;
        },
        set: async (data) => {
          for (const type in data) {
            if (!chavesSalvas[type]) chavesSalvas[type] = {};
            for (const id in data[type]) {
              if (data[type][id]) {
                chavesSalvas[type][id] = data[type][id];
              } else {
                delete chavesSalvas[type][id];
              }
            }
          }
          await guardarSessaoNoBanco();
        }
      }
    };

    const guardarSessaoNoBanco = async () => {
      try {
        const payload = JSON.stringify({ creds: state.creds, keys: chavesSalvas });
        await turso.execute({
          sql: "INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('whatsapp_full_session', ?)",
          args: [payload]
        });
      } catch (err) {
        console.error("❌ Erro ao salvar sessão completa no Turso:", err.message);
      }
    };

    whatsappClient = makeWASocket({
      auth: state,
      printQRInTerminal: false, 
      defaultQueryTimeoutMs: undefined,
      keepAliveIntervalMs: 30000, 
      options: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    });

    // ==========================================
    // 🤖 CHATBOT INTERATIVO PARA TRÁFEGO PAGO (DENTRO DO ESCOPO SEGURO)
    // ==========================================
    // 🔥 CORREÇÃO: Posicionado aqui dentro para garantir que 'whatsappClient' já exista!
    whatsappClient.ev.on('messages.upsert', async (m) => {
      try {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return; 

        const jid = msg.key.remoteJid;
        if (!jid.endsWith('@s.whatsapp.net')) return; 

        const numeroPuro = jid.split('@')[0];

        const resCliente = await turso.execute({
          sql: "SELECT id, nome, origem, etapa_chatbot FROM clientes WHERE telefone LIKE ?",
          args: [`%${numeroPuro}%`]
        });

        if (resCliente.rows.length === 0) return;
        
        const cliente = resCliente.rows[0];
        if (cliente.origem !== 'trafego_pago') return;

        const textoCliente = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim().toLowerCase();

        if (cliente.etapa_chatbot === 'inicio') {
          const boasVindas = `Olá, seja bem-vindo 💡\n\nAqui é o José da Ótica Luz, como posso ajudar?\n\n*Antes de começarmos, você já tem exame de vista recente?* \n*(Responda apenas SIM ou NÃO)*`;
          
          await whatsappClient.sendMessage(jid, { text: boasVindas });
          
          await turso.execute({
            sql: "UPDATE clientes SET etapa_chatbot = 'aguardando_exame' WHERE id = ?",
            args: [cliente.id]
          });
          return;
        }

        if (cliente.etapa_chatbot === 'aguardando_exame') {
          if (textoCliente === 'sim' || textoCliente === 'só' || textoCliente === 'tenho' || textoCliente === 's') {
            await whatsappClient.sendMessage(jid, { text: `Que ótimo! Já facilita muito. Vou te enviar um áudio explicativo e os nossos catálogos (Feminino e Masculino) para você dar uma olhada nas nossas armações! 👇` });
          } else if (textoCliente === 'não' || textoCliente === 'nao' || textoCliente === 'n' || textoCliente === 'não tenho') {
            await whatsappClient.sendMessage(jid, { text: `Não tem problema! Nós conseguimos te ajudar com isso também. Enquanto combinamos, vou te enviar um áudio explicativo e os nossos catálogos (Feminino e Masculino) para você conhecer nossos modelos! 👇` });
          } else {
            await whatsappClient.sendMessage(jid, { text: `Por favor, responda apenas *SIM* ou *NÃO* para que eu possa te direcionar corretamente. 😊` });
            return;
          }

          console.log(`📦 Disparando kit de mídia de tráfego pago para ${cliente.nome || numeroPuro}`);

          await whatsappClient.sendMessage(jid, {
            audio: { url: './midias/audio_explicativo.ogg' },
            mimetype: 'audio/mp4',
            ptt: true 
          });

          await new Promise(resolve => setTimeout(resolve, 2000));

          await whatsappClient.sendMessage(jid, {
            document: { url: './midias/catalogo_feminino.pdf' },
            mimetype: 'application/pdf',
            fileName: 'Catálogo Feminino - Ótica Luz.pdf'
          });

          await whatsappClient.sendMessage(jid, {
            document: { url: './midias/catalogo_masculino.pdf' },
            mimetype: 'application/pdf',
            fileName: 'Catálogo Masculino - Ótica Luz.pdf'
          });

          await turso.execute({
            sql: "UPDATE clientes SET etapa_chatbot = 'finalizado' WHERE id = ?",
            args: [cliente.id]
          });
        }

      } catch (error) {
        console.error('❌ Erro na execução do Chatbot de Tráfego Pago:', error);
      }
    });

    whatsappClient.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        statusConexao = 'Aguardando Leitura do QR Code';
        try {
          qrCodeBase64 = await QRCode.toDataURL(qr);
        } catch (err) {
          console.error('Erro ao gerar string do QR Code:', err);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error)?.output?.statusCode;
        const foiDeslogado = statusCode === DisconnectReason.loggedOut || statusCode === 401;
        
        console.log(`Conexão fechada. Código: ${statusCode}. Foi deslogado? ${foiDeslogado}`);
        statusConexao = 'Desconectado';
        qrCodeBase64 = null;

        if (foiDeslogado) {
          console.log('🧹 Limpando chaves revogadas da tabela...');
          try {
            await turso.execute("DELETE FROM configuracoes WHERE chave = 'whatsapp_full_session'");
          } catch (e) {
            console.log('Erro ao limpar banco:', e.message);
          }
          setTimeout(() => inicializarWhatsApp(), 2000);
        } else {
          inicializarWhatsApp();
        }
        
      } else if (connection === 'open') {
        statusConexao = 'Conectado';
        qrCodeBase64 = null;
        console.log('✅ WhatsApp conectado com sucesso via Baileys e Turso (Sessão Perpétua)!');

        setTimeout(() => {
          verificarAniversariantesDoDia();
          verificarPosVendaTrintaDias();
        }, 15000);
      }
    });

    whatsappClient.ev.on('creds.update', async () => {
      await guardarSessaoNoBanco();
    });

  } catch (error) {
    statusConexao = 'Erro ao conectar';
    console.error('Erro crítico ao iniciar Baileys:', error);
  }
}

async function enviarMensagemTexto(numeroComJid, texto) {
  if (!whatsappClient) throw new Error('Client Baileys não inicializado');
  await enviarMensagemTexto(numeroComJid, texto);
}

// 🔥 HIGIENIZAÇÃO INTELIGENTE DO 9: Valida o número com o 9 duplo, 
// se falhar, remove automaticamente o 9 excedente e tenta o JID clássico
async function validarNumeroWhatsApp(numeroPuro) {
  try {
    const [result] = await whatsappClient.onWhatsApp(`${numeroPuro}@s.whatsapp.net`);
    if (result && result.exists) {
      return result.jid;
    }
    
    if (numeroPuro.length === 13 && numeroPuro.startsWith('55')) {
      const numeroSemNonoDigito = numeroPuro.substring(0, 4) + numeroPuro.substring(5);
      const [resultFallback] = await whatsappClient.onWhatsApp(`${numeroSemNonoDigito}@s.whatsapp.net`);
      if (resultFallback && resultFallback.exists) {
        return resultFallback.jid;
      }
    }
    return `${numeroPuro}@s.whatsapp.net`;
  } catch (e) {
    return `${numeroPuro}@s.whatsapp.net`;
  }
}

// ==========================================
// 5. ROTINA AUTOMÁTICA DE DISPAROS
// ==========================================
async function verificarAniversariantesDoDia() {
  if (!whatsappClient || statusConexao !== 'Conectado') return;
  const hojeDataCompleta = new Date().toLocaleDateString('sv-SE'); 
  if (diaAtualGerenciamento !== hojeDataCompleta) {
    diaAtualGerenciamento = hojeDataCompleta;
    clientesEnviadosHoje = []; 
  }

  try {
    const resConfig = await turso.execute("SELECT valor FROM configuracoes WHERE chave = 'msg_aniversario'");
    const templateAniversario = resConfig.rows[0]?.valor || "Olá, {nome}! 🎉 Feliz Aniversário!";

    const resultado = await turso.transaction("read").then(async (tx) => {
      const res = await tx.execute(`
        SELECT id, nome, telefone FROM clientes 
        WHERE strftime('%m-%d', data_nascimento) = strftime('%m-%d', 'now', 'localtime')
      `);
      tx.close();
      return res;
    });
    
    if (resultado.rows.length === 0) return;
    
    for (const cliente of resultado.rows) {
      const identificadorUnico = cliente.id || cliente.telefone; 
      if (clientesEnviadosHoje.includes(identificadorUnico)) continue; 
      const { nome, telefone } = cliente;
      if (!telefone) continue;
      
      let numeroPuro = telefone.replace(/\D/g, '');
      if (!numeroPuro.startsWith('55')) numeroPuro = `55${numeroPuro}`;
      
      const message = templateAniversario.replace(/{nome}/g, nome);
      const jidValido = await validarNumeroWhatsApp(numeroPuro);
      
      try {
        await enviarMensagemTexto(jidValido, message); 
        clientesEnviadosHoje.push(identificadorUnico);
      } catch (err) {
        console.error(`Falha ao entregar mensagem para ${nome}:`, err.message);
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } catch (error) {
    console.error('❌ Erro na rotina de aniversariantes:', error);
  }
}

// ==========================================
// 6. ROTINA AUTOMÁTICA DE PÓS-VENDA
// ==========================================
async function verificarPosVendaTrintaDias() {
  if (!whatsappClient || statusConexao !== 'Conectado') return;
  const hojeDataCompleta = new Date().toLocaleDateString('sv-SE'); 
  if (diaAtualPosVendaGerenciamento !== hojeDataCompleta) {
    diaAtualPosVendaGerenciamento = hojeDataCompleta;
    posVendasEnviadosHoje = []; 
  }

  try {
    const resConfig = await turso.execute("SELECT valor FROM configuracoes WHERE chave = 'msg_pos_venda'");
    const templatePosVenda = resConfig.rows[0]?.valor || "Olá, {nome}! Obrigado por comprar o produto {produtos}.";

    const resultado = await turso.transaction("read").then(async (tx) => {
      const res = await tx.execute(`
        SELECT v.id AS venda_id, c.nome, c.telefone, v.produtos 
        FROM vendas v
        JOIN clientes c ON v.cliente_id = c.id
        WHERE date(v.criado_em) = date('now', '-30 days', 'localtime')
      `);
      tx.close();
      return res;
    });
    
    if (resultado.rows.length === 0) return;
    
    for (const venda of resultado.rows) {
      const { venda_id, nome, telefone, produtos } = venda;
      const identificadorVenda = venda_id || `${telefone}_${produtos}`;
      if (posVendasEnviadosHoje.includes(identificadorVenda)) continue;
      if (!telefone) continue;
      
      let numeroPuro = telefone.replace(/\D/g, '');
      if (!numeroPuro.startsWith('55')) numeroPuro = `55${numeroPuro}`;
      
      const message = templatePosVenda.replace(/{nome}/g, nome).replace(/{produtos}/g, produtos);
      const jidValido = await validarNumeroWhatsApp(numeroPuro);
      
      try {
        await enviarMensagemTexto(jidValido, message); 
        posVendasEnviadosHoje.push(identificadorVenda);
      } catch (err) {
        console.error(`Falha no pós-venda de ${nome}:`, err.message);
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } catch (error) {
    console.error('❌ Erro na rotina de pós-venda:', error);
  }
}

setInterval(() => {
  verificarAniversariantesDoDia();
  verificarPosVendaTrintaDias();
}, 1000 * 60 * 60);

// Auto-ping interno anti-sleep de 10 minutos
setInterval(async () => {
  try {
    const urlAutoPingLocal = `http://localhost:${PORT}/`;
    await fetch(urlAutoPingLocal);
  } catch (e) {
    // Mantém silencioso
  }
}, 1000 * 60 * 10);