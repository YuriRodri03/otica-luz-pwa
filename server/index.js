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

    // 🔥 Força a reinicialização automática em background para gerar um novo QR Code imediatamente
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
  
  // Inicialização imediata em background (Sem Puppeteer, não há risco de travar o HTTP server)
  inicializarWhatsApp();
});

// ==========================================
// 4. INICIALIZAÇÃO DO WHATSAPP (BAILEYS SEM NAVEGADOR)
// ==========================================
async function inicializarWhatsApp() {
  const tokenPath = path.resolve('/opt/render/project/src/server/tokens/otica-luz-session');
  
  // Define o diretório dos tokens de autenticação
  const { state, saveCreds } = await useMultiFileAuthState(tokenPath);

  try {
    whatsappClient = makeWASocket({
      auth: state,
      printQRInTerminal: false, 
      defaultQueryTimeoutMs: undefined,
    });

    // Ouvinte de atualizações de conexão e geração de QR Code
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
        
        // Se for deslogado (401), limpa os arquivos corrompidos para liberar o QR Code no próximo boot
        const foiDeslogado = statusCode === DisconnectReason.loggedOut || statusCode === 401;
        
        console.log(`Conexão fechada. Código: ${statusCode}. Foi deslogado? ${foiDeslogado}`);
        
        statusConexao = 'Desconectado';
        qrCodeBase64 = null;

        if (foiDeslogado) {
          console.log('🧹 Forçando limpeza física do diretório de credenciais antigas...');
          try {
            // 🔥 Remove de forma síncrona e forçada os arquivos corrompidos do disco do Render
            const fs = await import('fs');
            if (fs.existsSync(tokenPath)) {
              fs.rmSync(tokenPath, { recursive: true, force: true });
              console.log('✅ Diretório limpo com sucesso absoluto pelo FS!');
            }
          } catch (e) {
            console.log('Erro ao remover arquivos via fs:', e.message);
          }
          
          // Lança o boot limpo em seguida para gerar o QR Code na hora
          setTimeout(() => {
            console.log('🔄 Inicializando nova instância limpa para gerar o QR Code...');
            inicializarWhatsApp();
          }, 2000);
        } else {
          // Se caiu por oscilação de rede comum, apenas tenta reconectar de forma leve
          inicializarWhatsApp();
        }
        
      } else if (connection === 'open') {
        statusConexao = 'Conectado';
        qrCodeBase64 = null;
        console.log('✅ WhatsApp conectado com sucesso via Baileys!');

        setTimeout(() => {
          verificarAniversariantesDoDia();
          verificarPosVendaTrintaDias();
        }, 15000);
      }
    });

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
  
  // Limpa a lista de controle se mudou o dia (meia-noite)
  if (diaAtualGerenciamento !== hojeDataCompleta) {
    console.log(`📆 Novo dia detectado (${hojeDataCompleta}). Resetando lista de envios.`);
    diaAtualGerenciamento = hojeDataCompleta;
    clientesEnviadosHoje = []; // Esvazia a lista para o novo dia
  }

  console.log(`🔄 Rodando checagem de aniversariantes. Já enviados hoje: ${clientesEnviadosHoje.length}`);
  
  try {
    const resultado = await turso.transaction("read").then(async (tx) => {
      const res = await tx.execute(`
        SELECT id, nome, telefone FROM clientes 
        WHERE strftime('%m-%d', data_nascimento) = strftime('%m-%d', 'now', 'localtime')
      `);
      tx.close();
      return res;
    });
    
    if (resultado.rows.length === 0) {
      return;
    }
    
    for (const cliente of resultado.rows) {
      // 🔥 O SEGREDO: Em vez de ID, se sua tabela não tiver ID, use o 'telefone' como chave única
      const identificadorUnico = cliente.id || cliente.telefone; 
      
      // Se esse cliente específico já recebeu a mensagem hoje, pula ele!
      if (clientesEnviadosHoje.includes(identificadorUnico)) {
        continue; 
      }
      
      const { nome, telefone } = cliente;
      if (!telefone) continue;
      
      let numeroPuro = telefone.replace(/\D/g, '');
      if (!numeroPuro.startsWith('55')) numeroPuro = `55${numeroPuro}`;
      
      const message = `Olá, ${nome}! 🎉\n\nNós da *Ótica Luz* passamos para te desejar um feliz aniversário! 🎂✨\n\nQue o seu novo ciclo seja iluminado, cheio de saúde e muitas conquistas. Como presente, traga esta mensagem até a ótica durante o seu mês para retirar um brinde exclusivo! 🕶️💝`;
      
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

      // Se enviou com sucesso (ou tentou todas as vias), coloca o cliente na lista de bloqueio de hoje
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
// 6. ROTINA AUTOMÁTICA DE PÓS-VENDA (INTELIGENTE)
// ==========================================
async function verificarPosVendaTrintaDias() {
  if (!whatsappClient || statusConexao !== 'Conectado') return;

  const hojeDataCompleta = new Date().toLocaleDateString('sv-SE'); 
  
  // Limpa a lista de controle do pós-venda se mudou o dia (meia-noite)
  if (diaAtualPosVendaGerenciamento !== hojeDataCompleta) {
    console.log(`📆 Novo dia detectado para Pós-Venda (${hojeDataCompleta}). Resetando lista.`);
    diaAtualPosVendaGerenciamento = hojeDataCompleta;
    posVendasEnviadosHoje = []; // Esvazia a lista de controle do pós-venda
  }

  console.log(`🔄 Executando rotina de pós-venda. Já enviados hoje: ${posVendasEnviadosHoje.length}`);
  
  try {
    const resultado = await turso.transaction("read").then(async (tx) => {
      // 🔥 Adicionado 'v.id AS venda_id' para rastrear cada venda de forma única
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
      
      // 🔥 O SEGREDO: Se essa venda específica já recebeu o pós-venda hoje, pula ela!
      // Se por acaso sua tabela de vendas não tiver ID, use o 'telefone' como fallback secundário.
      const identificadorVenda = venda_id || `${telefone}_${produtos}`;
      if (posVendasEnviadosHoje.includes(identificadorVenda)) {
        continue;
      }
      
      if (!telefone) continue;
      
      let numeroPuro = telefone.replace(/\D/g, '');
      if (!numeroPuro.startsWith('55')) numeroPuro = `55${numeroPuro}`;
      
      const message = `Olá, ${nome}! Tudo bem? 😊\n\nHá cerca de um mês você esteve aqui na *Ótica Luz* e levou seu(s) produto(s): *${produtos}*.\n\nPassamos para saber como está sendo a sua experiência! Os óculos estão confortáveis? Precisando de qualquer ajuste na armação ou limpeza das lentes, lembre-se que você tem assistência gratuita aqui na loja. 🕶️✨\n\nSua satisfação é muito importante para nós!`;
      
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
      
      // Se o envio foi feito, salva no histórico da memória para não repetir na próxima hora
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