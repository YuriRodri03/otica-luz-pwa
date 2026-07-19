import express from 'express';
import cors from 'cors'; 
import { createClient } from '@libsql/client';
import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

dotenv.config();

// ==========================================
// 🛡️ ANTI-CRASH GLOBAL (Impede o servidor de morrer por erros não tratados)
// ==========================================
process.on('uncaughtException', (err) => {
  console.error('⚠️ [ANTI-CRASH] Erro Global (uncaughtException):', err);
});

process.on('unhandledRejection', (err) => {
  console.error('⚠️ [ANTI-CRASH] Rejeição Global (unhandledRejection):', err);
});

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
    
    // 🎯 Busca apenas as mensagens
    const r = await turso.execute({
      sql: "SELECT chave, valor FROM configuracoes WHERE chave IN ('msg_aniversario', 'msg_pos_venda')",
      args: []
    });
    
    if (r && r.rows) {
      r.rows.forEach(row => {
        const chave = row.chave !== undefined ? row.chave : row[0];
        const valor = row.valor !== undefined ? row.valor : row[1];
        if (chave) configs[chave] = valor;
      });
    }
    res.json(configs);
  } catch (error) {
    console.error('⚠️ [Erro GET] Falha ao ler templates no Turso:', error.message);
    res.status(503).json({ error: 'Banco de dados ocupado, tentando novamente...', detalhes: error.message });
  }
});

// Salva as configurações de mensagens de forma direta e isolada
app.post('/api/whatsapp/config-mensagens', async (req, res) => {
  try {
    const { msg_aniversario, msg_pos_venda } = req.body;
    
    // Atualiza apenas se foi enviado no payload
    if (msg_aniversario !== undefined) {
      await turso.execute({
        sql: "INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('msg_aniversario', ?)",
        args: [String(msg_aniversario).trim()]
      });
    }

    if (msg_pos_venda !== undefined) {
      await turso.execute({
        sql: "INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('msg_pos_venda', ?)",
        args: [String(msg_pos_venda).trim()]
      });
    }

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
    
    // 🎯 Limpar o banco de dados após forçar o logout
    await turso.execute("DELETE FROM configuracoes WHERE chave = 'whatsapp_full_session'");
    
    statusConexao = 'Desconectado';
    qrCodeBase64 = null;
    whatsappClient = null;
    res.json({ success: true, message: 'Sessão encerrada e limpa com sucesso.' });
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
    
    const resSessao = await turso.execute("SELECT valor FROM configuracoes WHERE chave = 'whatsapp_full_session'");
    
    let dadosSessao = { creds: null, keys: {} };
    if (resSessao.rows && resSessao.rows[0]?.valor) {
      try {
        // 🔥 USO CORRETO DO REVIVER DO BAILEYS PARA NÃO CORROMPER AS CHAVES
        dadosSessao = JSON.parse(resSessao.rows[0].valor, BufferJSON.reviver);
        console.log("📖 [Persistência Nível 2] Sessão criptográfica perpétua carregada do Turso.");
      } catch (e) {
        console.log("⚠️ Erro ao decodificar sessão completa, iniciando limpo...");
      }
    }
    
    const creds = dadosSessao.creds || initAuthCreds();
    const chavesSalvas = dadosSessao.keys || {};
    
    // 🔥 DEBOUNCE PARA NÃO DERRUBAR O TURSO E EVITAR O LOOP DE SINCRONIZAÇÃO
    let saveTimeout = null;
    const guardarSessaoNoBanco = async () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      
      saveTimeout = setTimeout(async () => {
        try {
          // Uso do replacer nativo do Baileys
          const payload = JSON.stringify({ creds: state.creds, keys: chavesSalvas }, BufferJSON.replacer);
          await turso.execute({
            sql: "INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('whatsapp_full_session', ?)",
            args: [payload]
          });
        } catch (err) {
          console.error("❌ Erro ao salvar sessão completa no Turso:", err.message);
        }
      }, 2500); // Aguarda 2.5 segundos após a última alteração de chave para salvar tudo de uma vez
    };

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
        set: (data) => {
          let mudouAlgo = false;
          for (const type in data) {
            if (
              type === 'app-state-sync-key' || 
              type === 'session' || 
              type === 'pre-key' ||
              type === 'sender-key' || 
              type === 'app-state-sync-version'
            ) {
              if (!chavesSalvas[type]) chavesSalvas[type] = {};
              for (const id in data[type]) {
                if (data[type][id]) {
                  chavesSalvas[type][id] = data[type][id];
                  mudouAlgo = true;
                } else if (chavesSalvas[type][id]) {
                  delete chavesSalvas[type][id];
                  mudouAlgo = true;
                }
              }
            }
          }
          if (mudouAlgo) {
             guardarSessaoNoBanco();
          }
        }
      }
    }

    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Usando versão do WA: ${version.join('.')}, é a mais recente? ${isLatest}`);

    whatsappClient = makeWASocket({
      auth: state,
      version: version, 
      printQRInTerminal: false, 
      browser: ['Ótica Luz', 'Chrome', '126.0.0.0'], 
      defaultQueryTimeoutMs: 90000, 
      keepAliveIntervalMs: 30000, 
      
      // 🚀 CONFIGURAÇÕES CRÍTICAS ANTITRAVAMENTO (HISTÓRICO):
      syncFullHistory: false,             // Não sincroniza o histórico completo do celular
      markOnlineOnConnect: false,         // Evita erro de timeout no handshake 
      linkPreviewKeystore: null,          // Economiza memória RAM no Render

      options: {
        timeout: 60000, 
      },

      // 🚀 IGNORA GRUPOS E LISTAS DE TRANSMISSÃO PESADAS:
      shouldIgnoreJid: (jid) => {
        return jid.endsWith('@broadcast') || 
               jid.includes('newsletter') || 
               jid.endsWith('@g.us'); // Ignora grupos para liberar a CPU do Render
      },

      // 🚀 FORÇA O BAILEYS A IGNORAR MENSAGENS ANTIGAS DO HISTÓRICO:
      shouldSyncHistoryMessage: (msg) => {
        // Permite apenas o mapeamento inicial necessário para a sessão não cair
        return msg.syncType === 'INITIAL_BOOTSTRAP' || msg.syncType === 'NON_BLOCKING_DATA'
      },
      
      patchMessageBeforeSending: (msg) => {
        const hasSender = !!(msg.message && (msg.message.buttonsMessage || msg.message.templateMessage || msg.message.listMessage));
        if (hasSender) {
            msg.message = { viewOnceMessage: { message: { messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} }, ...msg.message } } };
        }
        return msg;
      }
    });

    // ==========================================
    // 🤖 DISPARADOR AUTOMÁTICO DE MÍDIAS VIA TEXTO-GATILHO DO TRÁFEGO PAGO
    // ==========================================
    whatsappClient.ev.on('messages.upsert', async (m) => {
      try {
        const msg = m.messages[0];
        if (!msg.message) return; 

        const jid = msg.key.remoteJid;
        if (!jid.endsWith('@s.whatsapp.net')) return; 

        // Captura o texto recebido normalizando quebras de linha invisíveis
        const textoRecebido = (msg.message.conversation || msg.message.extendedTextMessage?.text || '')
          .replace(/\r\n/g, '\n')
          .trim();

        const gatilhoTrafegoPago = `Olá cliente, seja bem-vindo 💡\n\naqui é o José da Ótica Luz, como posso ajudar?`;

        if (textoRecebido === gatilhoTrafegoPago) {
          const numeroPuro = jid.split('@')[0];
          console.log(`🚀 Lead de tráfego pago detectado para o número: ${numeroPuro}. Enviando mídias...`);

          await new Promise(resolve => setTimeout(resolve, 3000));

          await whatsappClient.sendMessage(jid, {
            audio: { url: './midias/audio_explicativo.ogg' },
            mimetype: 'audio/mp4',
            ptt: true 
          });

          await new Promise(resolve => setTimeout(resolve, 4000));

          await whatsappClient.sendMessage(jid, {
            document: { url: './midias/catalogo_feminino.pdf' },
            mimetype: 'application/pdf',
            fileName: 'Catálogo Feminino - Ótica Luz.pdf'
          });

          await new Promise(resolve => setTimeout(resolve, 1500));

          await whatsappClient.sendMessage(jid, {
            document: { url: './midias/catalogo_masculino.pdf' },
            mimetype: 'application/pdf',
            fileName: 'Catálogo Masculino - Ótica Luz.pdf'
          });

          console.log(`✅ Combo de mídias enviado com sucesso para: ${numeroPuro}`);

          try {
            await turso.execute({
              sql: "INSERT OR IGNORE INTO clientes (telefone, origem, etapa_chatbot) VALUES (?, 'trafego_pago', 'finalizado')",
              args: [numeroPuro]
            });
            console.log(`💾 Novo lead ${numeroPuro} salvo no banco como 'trafego_pago'.`);
          } catch (dbErr) {
            console.error('⚠️ Erro ao registrar contato de tráfego pago:', dbErr.message);
          }
        }

      } catch (error) {
        console.error('❌ Erro no disparo automático por gatilho:', error);
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
        
        // Identifica erros fatais de autenticação ou loops de stream corrompida (ex: 401, 403, 515)
        const sessaoInvalida = statusCode === DisconnectReason.loggedOut || 
                               statusCode === 401 || 
                               statusCode === 403;
                               
        const streamErrored = statusCode === 515; // O erro específico que está dando no pareamento
        
        console.log(`Conexão fechada. Código: ${statusCode}. Sessão inválida? ${sessaoInvalida} | Stream Errored? ${streamErrored}`);
        statusConexao = 'Desconectado';
        qrCodeBase64 = null;

        // 🎯 Matando a instância velha para evitar "zumbis" na memória
        if (whatsappClient) {
            whatsappClient.ev.removeAllListeners();
            whatsappClient = null;
        }

        if (sessaoInvalida) {
          console.log('🧹 [Auto-Limpeza] Removendo registro inválido do Turso de forma automatizada...');
          try {
            await turso.execute("DELETE FROM configuracoes WHERE chave = 'whatsapp_full_session'");
          } catch (e) {
            console.log('Erro ao limpar banco:', e.message);
          }
          setTimeout(() => inicializarWhatsApp(), 3000);
        } else if (streamErrored) {
          console.log('⏳ [Estabilizador] Aguardando 12 segundos para consolidação do canal de criptografia...');
          setTimeout(() => inicializarWhatsApp(), 12000);
        } else {
          setTimeout(() => inicializarWhatsApp(), 5000);
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
  await whatsappClient.sendMessage(numeroComJid, { text: texto });
}

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