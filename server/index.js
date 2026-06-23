import express from 'express';
import cors from 'cors'; 
import { createClient } from '@libsql/client';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
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

// Conexão com o banco Turso
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
  disableMigrations: true, 
});

let ultimaDataPosVenda = null;
let whatsappClient = null; // Guardará a instância ativa do socket do Baileys
let ultimaDataEnvio = null; 
let statusConexao = 'Iniciando...';
let qrCodeBase64 = null;

// ==========================================
// 2. ROTAS DE CONTROLE PARA O FRONT-END (REACT)
// ==========================================

app.get('/api/whatsapp/status', (req, res) => {
  res.json({
    status: statusConexao,
    qr: qrCodeBase64 
  });
});

app.post('/api/whatsapp/desconectar', async (req, res) => {
  if (!whatsappClient) {
    return res.status(400).json({ error: 'WhatsApp não está ativo para desconectar.' });
  }
  try {
    await whatsappClient.logout();
    statusConexao = 'Desconectado';
    qrCodeBase64 = null;
    whatsappClient = null;
    res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
  } catch (error) {
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
  
  // Inicialização imediata em background (Sem Puppeteer, não há risco de travar o HTTP server)
  inicializarWhatsApp();
});

// ==========================================
// 4. INICIALIZAÇÃO DO WHATSAPP (BAILEYS SEM NAVEGADOR)
// ==========================================
async function inicializarWhatsApp() {
  // Define o diretório dos tokens de autenticação (leve e sem arquivos de cache do Chrome)
  const { state, saveCreds } = await useMultiFileAuthState(
    path.resolve('/opt/render/project/src/server/tokens/otica-luz-session')
  );

  try {
    whatsappClient = makeWASocket({
      auth: state,
      printQRInTerminal: false, // Desativa logs pesados
      defaultQueryTimeoutMs: undefined,
    });

    // Ouvinte de atualizações de conexão e geração de QR Code
    whatsappClient.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        statusConexao = 'Aguardando Leitura do QR Code';
        try {
          // Transforma a string do QR Code em Base64 DataURL compatível com o seu front-end
          qrCodeBase64 = await QRCode.toDataURL(qr);
        } catch (err) {
          console.error('Erro ao gerar string do QR Code:', err);
        }
      }

      if (connection === 'close') {
        const deveReiniciar = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('Conexão fechada devido a:', lastDisconnect?.error, '. Reiniciando de forma leve?', deveReiniciar);
        
        statusConexao = 'Desconectado';
        qrCodeBase64 = null;

        if (deveReiniciar) {
          inicializarWhatsApp(); // Tenta reconexão automática se não foi um logout manual
        }
      } else if (connection === 'open') {
        statusConexao = 'Conectado';
        qrCodeBase64 = null;
        console.log('✅ WhatsApp conectado com sucesso via Baileys!');

        // Executa rotinas automáticas após estabilizar a sincronização inicial
        setTimeout(() => {
          verificarAniversariantesDoDia();
          verificarPosVendaTrintaDias();
        }, 15000);
      }
    });

    // Necessário para salvar as chaves de segurança conforme a sessão avança
    whatsappClient.ev.on('creds.update', saveCreds);

  } catch (error) {
    statusConexao = 'Erro ao conectar';
    console.error('Erro crítico ao iniciar Baileys:', error);
  }
}

// Helper utilitário para formatar e enviar texto de forma limpa pelo Baileys
async function enviarMensagemTexto(numeroComJid, texto) {
  if (!whatsappClient) throw new Error('Client Baileys não inicializado');
  
  // No Baileys, o envio de texto puro segue essa estrutura simplificada
  await whatsappClient.sendMessage(numeroComJid, { text: texto });
}

// Helper leve para verificar se o número possui WhatsApp ativo no ecossistema
async function validarNumeroWhatsApp(numeroPuro) {
  try {
    const [result] = await whatsappClient.onWhatsApp(`${numeroPuro}@s.whatsapp.net`);
    if (result && result.exists) {
      return result.jid;
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
  if (ultimaDataEnvio === hojeDataCompleta) return;
  
  console.log(`🔄 Executando rotina de aniversariantes para o dia: ${hojeDataCompleta}`);
  
  try {
    const resultado = await turso.transaction("read").then(async (tx) => {
      const res = await tx.execute(`
        SELECT nome, telefone FROM clientes 
        WHERE strftime('%m-%d', data_nascimento) = strftime('%m-%d', 'now', 'localtime')
      `);
      tx.close();
      return res;
    });
    
    if (resultado.rows.length === 0) {
      console.log('📭 Nenhum aniversariante encontrado hoje.');
      ultimaDataEnvio = hojeDataCompleta;
      return;
    }
    
    for (const cliente of resultado.rows) {
      const { nome, telefone } = cliente;
      if (!telefone) continue;
      
      let numeroPuro = telefone.replace(/\D/g, '');
      if (!numeroPuro.startsWith('55')) numeroPuro = `55${numeroPuro}`;
      
      const message = `Olá, ${nome}! 🎉\n\nNós da *Ótica Luz* passamos para te desejar um feliz aniversário! 🎂✨\n\nQue o seu novo ciclo seja iluminado, cheio de saúde e muitas conquistas. Como presente, traga esta mensagem até a ótica durante o seu mês para retirar um brinde exclusivo! 🕶️💝`;
      
      console.log(`🚀 Iniciando tentativa de envio para ${nome} (${numeroPuro})`);
      let envioSucesso = false;

      try {
        const jidValido = await validarNumeroWhatsApp(numeroPuro);
        console.log(`📬 [Tentativa 1] Enviando para JID: ${jidValido}`);
        await enviarMensagemTexto(jidValido, message); 
        console.log(`✅ [Sucesso] Parabéns enviado na primeira tentativa para: ${nome}`);
        envioSucesso = true;
      } catch (erroPrimeiraTentativa) {
        console.log(`⚠️ [Falha 1] Erro na primeira tentativa: ${erroPrimeiraTentativa.message}`);
      }

      if (!envioSucesso && numeroPuro.length === 13) {
        console.log(`🔄 Tentando Fallback cortando o nono dígito...`);
        try {
          const numeroSemNonoDigito = numeroPuro.substring(0, 4) + numeroPuro.substring(5);
          const jidFallback = await validarNumeroWhatsApp(numeroSemNonoDigito);
          
          console.log(`📬 [Tentativa 2] Enviando para JID corrigido: ${jidFallback}`);
          await enviarMensagemTexto(jidFallback, message);
          console.log(`✅ [Sucesso] Parabéns enviado via Fallback para: ${nome}`);
          envioSucesso = true;
        } catch (erroSegundaTentativa) {
          console.error(`❌ [Falha no Fallback] Não foi possível enviar:`, erroSegundaTentativa.message);
        }
      }

      if (!envioSucesso) {
        console.error(`❌ [Falha Total] A mensagem para ${nome} não pôde ser entregue.`);
      }
      
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    ultimaDataEnvio = hojeDataCompleta;
  } catch (error) {
    console.error('❌ Erro na rotina de aniversariantes:', error);
  }
}

// ==========================================
// 6. ROTINA AUTOMÁTICA DE PÓS-VENDA (30 DIAS)
// ==========================================
async function verificarPosVendaTrintaDias() {
  if (!whatsappClient || statusConexao !== 'Conectado') return;

  const hojeDataCompleta = new Date().toLocaleDateString('sv-SE'); 
  if (ultimaDataPosVenda === hojeDataCompleta) return;
  
  console.log(`🔄 Executando rotina de pós-venda para vendas de 30 dias atrás...`);
  
  try {
    const resultado = await turso.transaction("read").then(async (tx) => {
      const res = await tx.execute(`
        SELECT c.nome, c.telefone, v.produtos 
        FROM vendas v
        JOIN clientes c ON v.cliente_id = c.id
        WHERE date(v.criado_em) = date('now', '-30 days', 'localtime')
      `);
      tx.close();
      return res;
    });
    
    if (resultado.rows.length === 0) {
      console.log('📭 Nenhuma venda encontrada para pós-venda hoje.');
      ultimaDataPosVenda = hojeDataCompleta;
      return;
    }
    
    for (const venda of resultado.rows) {
      const { nome, telefone, produtos } = venda;
      if (!telefone) continue;
      
      let numeroPuro = telefone.replace(/\D/g, '');
      if (!numeroPuro.startsWith('55')) numeroPuro = `55${numeroPuro}`;
      
      const message = `Olá, ${nome}! Tudo bem? 😊\n\nHá cerca de um mês você esteve aqui na *Ótica Luz* e levou seu(s) produto(s): *${produtos}*.\n\nPassamos para saber como está sendo a sua experiência! Os óculos estão confortáveis? Precisando de qualquer ajuste na armação ou limpeza das lentes, lembre-se que você tem assistência gratuita aqui na loja. 🕶️✨\n\nSua satisfação é muito importante para nós!`;
      
      console.log(`🚀 Enviando pós-venda para ${nome} (${numeroPuro})`);
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
      
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    
    ultimaDataPosVenda = hojeDataCompleta;
  } catch (error) {
    console.error('❌ Erro na rotina de pós-venda:', error);
  }
}

// Verifica de hora em hora se virou o dia para disparar novamente
setInterval(() => {
  verificarAniversariantesDoDia();
  verificarPosVendaTrintaDias();
}, 1000 * 60 * 60);