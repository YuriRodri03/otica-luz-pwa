import express from 'express';
import cors from 'cors'; 
import { createClient } from '@libsql/client';
import * as wppconnect from '@wppconnect-team/wppconnect';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// ==========================================
// 1. CONFIGURAÇÕES GLOBAIS (MIDDLEWARES)
// ==========================================
app.use(express.json());
app.use(cors()); 

const PORT = process.env.PORT || 8080;

// Conexão com o banco Turso
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
  disableMigrations: true, 
});

let ultimaDataPosVenda = null;
let whatsappClient = null;
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
    whatsappClient = null;
    res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => res.send('Servidor Ótica Luz Ativo!'));

// ==========================================
// 3. INICIALIZAÇÃO DO SERVIDOR HTTP primeiro
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor HTTP rodando na porta ${PORT}`);
  
  // Liga o WhatsApp apenas após o servidor Express estar de pé escutando as rotas
  inicializarWhatsApp();
});

// ==========================================
// 4. INICIALIZAÇÃO DO WHATSAPP (OTIMIZADA PARA O RENDER)
// ==========================================
function inicializarWhatsApp() {
  wppconnect
    .create({
      session: 'otica-luz-session',
      catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
        statusConexao = 'Aguardando Leitura do QR Code';
        qrCodeBase64 = base64Qr; 
      },
      statusFind: (statusSession, session) => {
        statusConexao = statusSession;
        console.log('Status da Sessão:', statusSession);
      },
      headless: true,
      devtools: false,
      useChrome: false,
      debug: false,
      logQR: false,
      autoClose: 0,
      // 🔥 CONFIGURAÇÕES CRUCIAIS PARA PREVENIR CRASH DE MEMÓRIA (RAM) NO RENDER:
      puppeteerOptions: {
        userDataDir: '/opt/render/project/src/server/tokens/otica-luz-session', // Pasta persistente
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', // Evita estouro de RAM compartilhada
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process', // Força o Chromium a abrir apenas um processo (economia extrema)
          '--disable-gpu', // Desativa processamento gráfico
          '--js-flags="--max-old-space-size=150"' // 🔥 Limita o Javascript do Chromium a usar no máximo 150MB de RAM
        ]
      }
    })
    .then((client) => {
      whatsappClient = client;
      statusConexao = 'Conectado';
      qrCodeBase64 = null; 
      console.log('✅ WhatsApp conectado com sucesso!');

      // Executa as rotinas diárias normais após 30 segundos
      setTimeout(() => {
        verificarAniversariantesDoDia();
        verificarPosVendaTrintaDias();
      }, 30000);
    })
    .catch((error) => {
      statusConexao = 'Erro ao conectar';
      console.error('Erro ao iniciar o WhatsApp:', error);
    });
}

// ==========================================
// 5. ROTINA AUTOMÁTICA DE DISPAROS (CORRIGIDA)
// ==========================================
async function verificarAniversariantesDoDia() {
  if (!whatsappClient) return;

  try {
    const estaConectado = await whatsappClient.isConnected();
    if (!estaConectado) {
      console.log('⏳ Adiando checagem: O WhatsApp está autenticado, mas a interface Web ainda está carregando chats...');
      return;
    }
  } catch (err) {
    console.log('⏳ Adiando checagem: Aguardando inicialização completa dos scripts do WhatsApp Web.');
    return;
  }

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
        const infoNumero = await whatsappClient.checkNumberStatus(`${numeroPuro}@c.us`);
        const destinatarioValido = infoNumero?.id?._serialized || `${numeroPuro}@c.us`;
        
        console.log(`📬 [Tentativa 1] Enviando para ID: ${destinatarioValido}`);
        await whatsappClient.sendText(destinatarioValido, message); 
        console.log(`✅ [Sucesso] Parabéns enviado na primeira tentativa para: ${nome}`);
        envioSucesso = true;
      } catch (erroPrimeiraTentativa) {
        console.log(`⚠️ [Falha 1] Erro na primeira tentativa (${erroPrimeiraTentativa.message}).`);
      }

      if (!envioSucesso && numeroPuro.length === 13) {
        console.log(`🔄 Tentando Fallback cortando o nono dígito para o número de 13 dígitos...`);
        try {
          const numeroSemNonoDigito = numeroPuro.substring(0, 4) + numeroPuro.substring(5);
          const destinatarioFallback = `${numeroSemNonoDigito}@c.us`;
          
          console.log(`📬 [Tentativa 2] Enviando para ID corrigido: ${destinatarioFallback}`);
          await whatsappClient.sendText(destinatarioFallback, message);
          console.log(`✅ [Sucesso] Parabéns enviado via Fallback para: ${nome}`);
          envioSucesso = true;
        } catch (erroSegundaTentativa) {
          console.error(`❌ [Falha no Fallback] Não foi possível enviar cortando o 9:`, erroSegundaTentativa.message);
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
  if (!whatsappClient) return;

  try {
    const estaConectado = await whatsappClient.isConnected();
    if (!estaConectado) return;
  } catch (err) {
    return;
  }

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
      
      const message = `Olá, ${nome}! Tudo bem? 😊\n\nHá cerca de um mês você esteve aqui na *Ótica Luz* e levou seu(s) product(s): *${produtos}*.\n\nPassamos para saber como está sendo a sua experiência! Os óculos estão confortáveis? Precisando de qualquer ajuste na armação ou limpeza das lentes, lembre-se que você tem assistência gratuita aqui na loja. 🕶️✨\n\nSua satisfação é muito importante para nós!`;
      
      console.log(`🚀 Enviando pós-venda para ${nome} (${numeroPuro})`);
      let envioSucesso = false;

      try {
        const infoNumero = await whatsappClient.checkNumberStatus(`${numeroPuro}@c.us`);
        const destinatarioValido = infoNumero?.id?._serialized || `${numeroPuro}@c.us`;
        
        await whatsappClient.sendText(destinatarioValido, message); 
        console.log(`✅ [Pós-Venda] Mensagem entregue para: ${nome}`);
        envioSucesso = true;
      } catch (err) {
        console.log(`⚠️ [Pós-Venda] Falha na primeira tentativa para ${nome}.`);
      }

      if (!envioSucesso && numeroPuro.length === 13) {
        try {
          const numeroSemNonoDigito = numeroPuro.substring(0, 4) + numeroPuro.substring(5);
          await whatsappClient.sendText(`${numeroSemNonoDigito}@c.us`, message);
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

// Verifica a cada 1 hora se mudou o dia para rodar novamente as rotinas
setInterval(() => {
  verificarAniversariantesDoDia();
  verificarPosVendaTrintaDias();
}, 1000 * 60 * 60);