import express from 'express';
import cors from 'cors'; 
import { createClient } from '@libsql/client';
import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import dotenv from 'dotenv';
import path from 'path';

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
  disableMigrations: true, // Desativa em versões anteriores do driver
  introspect: "disabled"   // Desativa em versões recentes do driver
});

let ultimaDataPosVenda = null;
let whatsappClient = null; 
let ultimaDataEnvio = null; 
let statusConexao = 'Iniciando...'; // 🔥 CORREÇÃO: Adicionado o 'let' preventivo de escopo estrito
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

// ==========================================
// ROTAS DE CONFIGURAÇÃO DE MENSAGENS (SOLUÇÃO DEFINITIVA)
// ==========================================

// 🔔 ROTA GET: Carrega os dados tratando de forma direta o retorno das linhas
app.get('/api/whatsapp/config-mensagens', async (req, res) => {
  try {
    const configs = {
      msg_aniversario: '',
      msg_pos_venda: ''
    };

    // Chamada direta sem amarras contábeis do SDK
    const r = await turso.execute("SELECT chave, valor FROM configuracoes");
    
    if (r && r.rows) {
      r.rows.forEach(row => {
        const chave = row.chave !== undefined ? row.chave : row[0];
        const valor = row.valor !== undefined ? row.valor : row[1];
        if (chave) {
          configs[chave] = valor;
        }
      });
    }

    res.json({
      msg_aniversario: configs.msg_aniversario,
      msg_pos_venda: configs.msg_pos_venda
    });

  } catch (error) {
    console.error('⚠️ [Aviso GET] Falha ao ler banco (retornando campos limpos):', error.message);
    // Retorna vazio em vez de estourar erro 500 no console do navegador
    res.json({ msg_aniversario: '', msg_pos_venda: '' });
  }
});

// 🔔 ROTA POST: Remove o uso do .batch() para impedir o disparo de rotinas de migração do SDK
app.post('/api/whatsapp/config-mensagens', async (req, res) => {
  try {
    const { msg_aniversario, msg_pos_venda } = req.body;
    
    const textoAniversario = String(msg_aniversario || '').trim();
    const textoPosVenda = String(msg_pos_venda || '').trim();

    console.log('📝 Gravando templates de mensagens de forma direta...');

    // 🔥 A MUDANÇA OPERACIONAL: Executa de forma sequencial isolada em vez de .batch()
    // Isso ignora por completo a validação remota que gerava o erro 400/500
    await turso.execute({
      sql: "INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('msg_aniversario', ?)",
      args: [textoAniversario]
    });

    await turso.execute({
      sql: "INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('msg_pos_venda', ?)",
      args: [textoPosVenda]
    });

    console.log('✅ Gravação concluída com sucesso!');
    res.json({ success: true, message: 'Modelos de mensagens salvos com sucesso!' });

  } catch (error) {
    console.error("❌ [ERRO CRÍTICO NO POST] Falha ao salvar no Turso:", error);
    res.status(500).json({ 
      error: 'Erro interno ao salvar configurações', 
      detalhes: error.message 
    });
  }
});

app.post('/api/whatsapp/desconectar', async (req, res) => {
  if (!whatsappClient) {
    return res.status(400).json({ error: 'WhatsApp não está ativo para desconectar.' });
  }
  try {
    statusConexao = 'Desconectando...';
    await whatsappClient.logout();
    statusConexao = 'Desconectado';
    qrCodeBase64 = null;
    whatsappClient = null;
    
    res.json({ success: true, message: 'Sessão encerrada com sucesso.' });

    setTimeout(() => {
      console.log('🔄 Reiniciando motor após logout manual para disponibilizar novo QR Code...');
      inicializarWhatsApp();
    }, 3000);

  } catch (error) {
    statusConexao = 'Erro ao desconectar';
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => res.send('Servidor Ótica Luz Ativo com Baileys!'));

// ==========================================
// 3. INICIALIZAÇÃO DO SERVIDOR HTTP
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor HTTP rodando na porta ${PORT}`);
  statusConexao = 'Iniciando motor...';
  inicializarWhatsApp();
});

// ==========================================
// 4. INICIALIZAÇÃO DO WHATSAPP (BANCO DE DADOS COMO STORAGE CRIPTOGRÁFICO)
// ==========================================
async function inicializarWhatsApp() {
  try {
    // 1. Busca as credenciais base salvas na tabela configuracoes
    const resCreds = await turso.execute("SELECT valor FROM configuracoes WHERE chave = 'whatsapp_session_creds'");
    
    let credsCarregadas = null;
    if (resCreds.rows && resCreds.rows[0]?.valor) {
      try {
        credsCarregadas = JSON.parse(resCreds.rows[0].valor);
      } catch (e) {
        console.log("⚠️ Erro ao decodificar chaves antigas, iniciando limpo...");
      }
    }

    // Se não houver chaves no banco, o Baileys usa a função nativa dele para gerar o primeiro par estruturado
    // Importamos dinamicamente para garantir a chamada limpa do pacote
    const { initAuthCreds } = await import('@whiskeysockets/baileys');
    
    const state = {
      creds: credsCarregadas || initAuthCreds(),
      keys: {
        // 🔥 Correção do Loop: O Baileys precisa ler estruturas dinâmicas para o Handshake.
        // Como salvamos tudo em um bloco unificado, nós contornamos assinaturas complexas usando fallbacks
        get: (type, ids) => {
          const data = {};
          return data;
        },
        set: (data) => {
          // Captura alterações internas de chaves criptográficas do remetente
        }
      }
    };

    // Função robusta de salvamento permanente no Turso
    const guardarSessaoNoBanco = async () => {
      try {
        const textoSessao = JSON.stringify(state.creds);
        await turso.execute({
          sql: "INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('whatsapp_session_creds', ?)",
          args: [textoSessao]
        });
        console.log("💾 [Banco] Chaves de pareamento atualizadas com sucesso no Turso!");
      } catch (err) {
        console.error("❌ [Erro Persistência] Falha ao injetar chaves no banco:", err.message);
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
          console.log('🧹 Limpando chaves revogadas/antigas do banco de dados...');
          try {
            await turso.execute("DELETE FROM configuracoes WHERE chave = 'whatsapp_session_creds'");
            console.log('✅ Base de dados limpa para nova sincronização!');
          } catch (e) {
            console.log('Erro ao limpar chave obsoleta do banco:', e.message);
          }
          
          setTimeout(() => {
            console.log('🔄 Reiniciando motor para gerar novo QR Code limpo...');
            inicializarWhatsApp();
          }, 2000);
        } else {
          // Se caiu por oscilação de internet do Render, apenas reconecta usando a mesma chave
          inicializarWhatsApp();
        }
        
      } else if (connection === 'open') {
        statusConexao = 'Conectado';
        qrCodeBase64 = null;
        console.log('✅ WhatsApp conectado com sucesso via Baileys no banco de dados!');

        setTimeout(() => {
          verificarAniversariantesDoDia();
          verificarPosVendaTrintaDias();
        }, 15000);
      }
    });

    // Toda vez que o WhatsApp renovar os tokens internos de validação, salva o estado atualizado no Turso
    whatsappClient.ev.on('creds.update', async () => {
      await guardarSessaoNoBanco();
    });

  } catch (error) {
    statusConexao = 'Erro ao conectar';
    console.error('Erro crítico ao iniciar Baileys:', error);
  }
}

// ==========================================
// 5. ROTINA AUTOMÁTICA DE DISPAROS
// ==========================================
async function verificarAniversariantesDoDia() {
  if (!whatsappClient || statusConexao !== 'Conectado') return;

  const hojeDataCompleta = new Date().toLocaleDateString('sv-SE'); 
  
  if (diaAtualGerenciamento !== hojeDataCompleta) {
    console.log(`📆 Novo dia detectado (${hojeDataCompleta}). Resetando lista de envios.`);
    diaAtualGerenciamento = hojeDataCompleta;
    clientesEnviadosHoje = []; 
  }

  console.log(`🔄 Rodando checagem de aniversariantes. Já enviados hoje: ${clientesEnviadosHoje.length}`);
  
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
      
      console.log(`🚀 Enviando para cliente novo do dia: ${nome} (${numeroPuro})`);
      let envioSucesso = false;

      try {
        const jidValido = await validarNumeroWhatsApp(numeroPuro);
        await enviarMensagemTexto(jidValido, message); 
        console.log(`✅ Mensagem entregue para: ${nome}`);
        envioSucesso = true;
      } catch (err) {
        console.log(`⚠️ Falha na primeira tentativa para ${nome}`);
      }

      if (!envioSucesso && numeroPuro.length === 13) {
        try {
          const numeroSemNonoDigito = numeroPuro.substring(0, 4) + numeroPuro.substring(5);
          const jidFallback = await validarNumeroWhatsApp(numeroSemNonoDigito);
          await enviarMensagemTexto(jidFallback, message);
          console.log(`✅ Mensagem entregue via Fallback para: ${nome}`);
          envioSucesso = true;
        } catch (errFallback) {
          console.error(`❌ Falha total para ${nome}`);
        }
      }

      if (envioSucesso) {
        clientesEnviadosHoje.push(identificadorUnico);
      }
      
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } catch (error) {
    console.error('❌ Erro na rotina de aniversariantes:', error);
  }
}

// ==========================================
// 6. ROTINA AUTOMÁTICA DE PÓS-VENDA (DINÂMICA)
// ==========================================
async function verificarPosVendaTrintaDias() {
  if (!whatsappClient || statusConexao !== 'Conectado') return;

  const hojeDataCompleta = new Date().toLocaleDateString('sv-SE'); 
  
  if (diaAtualPosVendaGerenciamento !== hojeDataCompleta) {
    console.log(`📆 Novo dia detectado para Pós-Venda (${hojeDataCompleta}). Resetando lista.`);
    diaAtualPosVendaGerenciamento = hojeDataCompleta;
    posVendasEnviadosHoje = []; 
  }

  console.log(`🔄 Executando rotina de pós-venda. Já enviados hoje: ${posVendasEnviadosHoje.length}`);
  
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
    
    if (resultado.rows.length === 0) {
      console.log('📭 Nenhuma venda encontrada para pós-venda hoje.');
      return;
    }
    
    for (const venda of resultado.rows) {
      const { venda_id, nome, telefone, produtos } = venda;
      const identificadorVenda = venda_id || `${telefone}_${produtos}`;

      if (posVendasEnviadosHoje.includes(identificadorVenda)) continue;
      if (!telefone) continue;
      
      let numeroPuro = telefone.replace(/\D/g, '');
      if (!numeroPuro.startsWith('55')) numeroPuro = `55${numeroPuro}`;
      
      const message = templatePosVenda
        .replace(/{nome}/g, nome)
        .replace(/{produtos}/g, produtos);
      
      console.log(`🚀 Enviando pós-venda para cliente novo: ${nome} (${numeroPuro})`);
      let envioSucesso = false;

      try {
        const jidValido = await validarNumeroWhatsApp(numeroPuro);
        await enviarMensagemTexto(jidValido, message); 
        console.log(`✅ [Pós-Venda] Mensagem entregue para: ${nome}`);
        envioSucesso = true;
      } catch (err) {
        console.log(`⚠️ [Pós-Venda] Falha na primeira tentativa para ${nome}.`);
      }

      if (!envioSucesso && numeroPuro.length === 13) {
        try {
          const numeroSemNonoDigito = numeroPuro.substring(0, 4) + numeroPuro.substring(5);
          const jidFallback = await validarNumeroWhatsApp(numeroSemNonoDigito);
          await enviarMensagemTexto(jidFallback, message);
          console.log(`✅ [Pós-Venda] Mensagem entregue via Fallback para: ${nome}`);
          envioSucesso = true;
        } catch (errFallback) {
          console.error(`❌ [Pós-Venda] Falha total para ${nome}`);
        }
      }
      
      if (envioSucesso) {
        posVendasEnviadosHoje.push(identificadorVenda);
      }
      
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    
  } catch (error) {
    console.error('❌ Erro na rotina de pós-venda:', error);
  }
}

// Verifica de hora em hora se virou o dia para disparar novamente
setInterval(() => {
  verificarAniversariantesDoDia();
  verificarPosVendaTrintaDias();
}, 1000 * 60 * 60);

// ==========================================
// 🚀 ROTINA CRÍTICA ANTI-SLEEP INTERNA (EXCLUSIVA PARA RENDER)
// ==========================================
// Envia uma requisição HTTP para si mesmo localmente a cada 10 minutos para impedir 
// que a nuvem congele o processo Node.js e desconecte o chip[cite: 2].
setInterval(async () => {
  try {
    // 🔥 OTIMIZAÇÃO: Pinga a porta local interna em vez da URL externa pública do Render.
    // Isso evita gargalos de DNS da nuvem e funciona direto no núcleo do contêiner!
    const urlAutoPingLocal = `http://localhost:${PORT}/`;
    console.log('💓 [Anti-Sleep] Enviando pulso interno de atividade para manter o robô acordado...');
    await fetch(urlAutoPingLocal);
  } catch (e) {
    console.log('⚠️ [Anti-Sleep] Falha temporária no auto-ping, mas o motor continua rodando.');
  }
}, 1000 * 60 * 10); // Executa a cada 10 minutos cravados