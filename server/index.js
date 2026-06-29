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

// 🔔 NOVA ROTA: Obter os modelos de mensagens cadastrados
app.get('/api/whatsapp/config-mensagens', async (req, res) => {
  try {
    const r = await turso.execute("SELECT * FROM configuracoes");
    const configs = {};
    r.rows.forEach(row => {
      configs[row.chave] = row.valor;
    });
    res.json({
      msg_aniversario: configs.msg_aniversario || '',
      msg_pos_venda: configs.msg_pos_venda || ''
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar configurações no Turso: ' + error.message });
  }
});

// ==========================================
// ROTAS DE CONFIGURAÇÃO DE MENSAGENS (BLINDADAS)
// ==========================================

// 🔔 ROTA GET: Busca e garante o mapeamento correto das linhas do Turso
app.get('/api/whatsapp/config-mensagens', async (req, res) => {
  try {
    const r = await turso.execute("SELECT chave, valor FROM configuracoes");
    const configs = {};
    
    if (r && r.rows) {
      r.rows.forEach(row => {
        // Suporta tanto acesso por propriedade (.chave) quanto por índice caso mude a versão do driver
        const chave = row.chave || row[0];
        const valor = row.valor || row[1];
        if (chave) {
          configs[chave] = valor;
        }
      });
    }

    res.json({
      msg_aniversario: configs.msg_aniversario || '',
      msg_pos_venda: configs.msg_pos_venda || ''
    });
  } catch (error) {
    console.error('Erro na rota GET config-mensagens:', error);
    res.status(500).json({ error: 'Erro ao buscar configurações no Turso: ' + error.message });
  }
});

// 🔔 ROTA GET: Busca e garante o mapeamento correto das linhas do Turso sem travar o motor
app.get('/api/whatsapp/config-mensagens', async (req, res) => {
  try {
    // Inicializa o objeto com os fallbacks vazios padrão
    const configs = {
      msg_aniversario: '',
      msg_pos_venda: ''
    };

    const r = await turso.execute("SELECT chave, valor FROM configuracoes");
    
    // Se a tabela existir e retornar dados, processa com segurança
    if (r && r.rows && Array.isArray(r.rows)) {
      for (const row of r.rows) {
        // Blinda contra qualquer variação de propriedade ou índice do driver do Turso
        const chave = row.chave !== undefined ? row.chave : (row[0] !== undefined ? row[0] : null);
        const valor = row.valor !== undefined ? row.valor : (row[1] !== undefined ? row[1] : '');
        
        if (chave) {
          configs[chave] = valor;
        }
      }
    }

    // Retorna sempre um JSON estruturado para o React não dar crash
    res.json({
      msg_aniversario: configs.msg_aniversario || '',
      msg_pos_venda: configs.msg_pos_venda || ''
    });

  } catch (error) {
    // 🔥 Captura no console do Render o motivo exato (ex: tabela bloqueada, coluna inválida)
    console.error('❌ [ERRO CRÍTICO] Falha na rota GET config-mensagens:', error);
    
    // Fallback amigável: em vez de estourar 500, manda vazio para o React renderizar as caixas limpas para digitação
    res.json({
      msg_aniversario: '',
      msg_pos_venda: ''
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
// 4. INICIALIZAÇÃO DO WHATSAPP (BAILEYS SEM NAVEGADOR)
// ==========================================
async function inicializarWhatsApp() {
  const tokenPath = path.resolve('/opt/render/project/src/server/tokens/otica-luz-session');
  const { state, saveCreds } = await useMultiFileAuthState(tokenPath);

  try {
    whatsappClient = makeWASocket({
      auth: state,
      printQRInTerminal: false, 
      defaultQueryTimeoutMs: undefined,
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
          console.log('🧹 Forçando limpeza física do diretório de credenciais antigas...');
          try {
            const fs = await import('fs');
            if (fs.existsSync(tokenPath)) {
              fs.rmSync(tokenPath, { recursive: true, force: true });
              console.log('✅ Diretório limpo com sucesso absoluto pelo FS!');
            }
          } catch (e) {
            console.log('Erro ao remover arquivos via fs:', e.message);
          }
          
          setTimeout(() => {
            console.log('🔄 Inicializando nova instância limpa para gerar o QR Code...');
            inicializarWhatsApp();
          }, 2000);
        } else {
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
    console.log(`📆 Novo dia detectado (${hojeDataCompleta}). Resetando lista de envios.`);
    diaAtualGerenciamento = hojeDataCompleta;
    clientesEnviadosHoje = []; 
  }

  console.log(`🔄 Rodando checagem de aniversariantes. Já enviados hoje: ${clientesEnviadosHoje.length}`);
  
  try {
    // 🔥 BUSCA O MODELO DINÂMICO SALVO NO BANCO
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
      
      // 🔥 RECONSTRÓI A MENSAGEM TROCANDO A TAG {nome} PELO NOME DO CLIENTE
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
    // 🔥 BUSCA O MODELO DINÂMICO SALVO NO BANCO
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
      
      // 🔥 RECONSTRÓI A MENSAGEM SUBSTITUINDO AS TAGS DINÂMICAS {nome} E {produtos}
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