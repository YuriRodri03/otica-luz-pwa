import React, { useState, useEffect } from 'react';
import { QrCode, RefreshCw, CheckCircle, XCircle, Loader2, AlertTriangle, MessageSquare, Save } from 'lucide-react';

export default function WhatsappControl() {
  const [status, setStatus] = useState('Buscando...');
  const [qr, setQr] = useState(null);
  const [carregando, setCarregando] = useState(false);

  // 🔥 NOVOS ESTADOS: Controle dos templates de mensagens editáveis
  const [msgAniversario, setMsgAniversario] = useState('');
  const [msgPosVenda, setMsgPosVenda] = useState('');
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  // ==========================================
  // ESTADO PARA MODAL DE AVISO / CONFIRMAÇÃO INTEGRADO
  // ==========================================
  const [alertaConfig, setAlertaConfig] = useState({
    aberto: false,
    tipo: 'aviso', // 'confirmacao' | 'erro' | 'sucesso'
    titulo: '',
    mensagem: '',
    onConfirmar: null
  });

  const API_URL = import.meta.env.VITE_API_URL || 'https://otica-luz-pwa.onrender.com'; 

  const checarStatusConexao = async () => {
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/status`);
      const dados = await res.json();
      setStatus(dados.status);
      setQr(dados.qr);
    } catch (error) {
      setStatus('Servidor Off-line');
      setQr(null);
    }
  };

  // 🔥 NOVA FUNÇÃO: Carrega as mensagens salvas no banco de dados do Turso
  const carregarTemplatesMensagens = async () => {
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/config-mensagens`);
      const dados = await res.json();
      setMsgAniversario(dados.msg_aniversario || '');
      setMsgPosVenda(dados.msg_pos_venda || '');
    } catch (error) {
      console.error("Erro ao carregar templates de mensagens:", error);
    }
  };

  // Monitoramento ativo e carregamento inicial
  useEffect(() => {
    checarStatusConexao();
    carregarTemplatesMensagens();
    const intervalo = setInterval(checarStatusConexao, 5000);
    return () => clearInterval(intervalo);
  }, []);

  // 🔥 NOVA FUNÇÃO: Envia os novos templates de texto para o Node.js
  const handleSalvarMensagens = async (e) => {
    e.preventDefault();
    setSalvandoConfig(true);
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/config-mensagens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_aniversario: msgAniversario,
          msg_pos_venda: msgPosVenda
        })
      });
      const resultado = await res.json();
      if (resultado.success) {
        setAlertaConfig({
          aberto: true,
          tipo: 'sucesso',
          titulo: 'Templates Atualizados',
          mensagem: 'Os novos modelos de automação foram salvos no banco de dados e aplicados!',
          onConfirmar: null
        });
      }
    } catch (error) {
      setAlertaConfig({
        aberto: true,
        tipo: 'erro',
        titulo: 'Erro ao Salvar',
        mensagem: 'Não foi possível atualizar as mensagens no servidor.',
        onConfirmar: null
      });
    } finally {
      setSalvandoConfig(false);
    }
  };

  // ==========================================
  // DESCONEXÃO DO CONTEXTO
  // ==========================================
  const handleDesconectar = () => {
    setAlertaConfig({
      aberto: true,
      tipo: 'confirmacao',
      titulo: 'Desconectar WhatsApp',
      mensagem: 'Tem certeza que deseja desvincular o WhatsApp da Ótica Luz? O robô interromperá as rotinas de disparos automatizados.',
      onConfirmar: async () => {
        setCarregando(true);
        try {
          await fetch(`${API_URL}/api/whatsapp/desconectar`, { method: 'POST' });
          await checarStatusConexao();
          setAlertaConfig({
            aberto: true,
            tipo: 'sucesso',
            titulo: 'Sessão Encerrada',
            mensagem: 'O aparelho foi desconectado com sucesso.',
            onConfirmar: null
          });
        } catch (error) {
          setAlertaConfig({
            aberto: true,
            tipo: 'erro',
            titulo: 'Falha de Conexão',
            mensagem: 'Erro operacional ao tentar se comunicar com o servidor Render.',
            onConfirmar: null
          });
        } finally {
          setCarregando(false);
        }
      }
    });
  };

  const isConectado = status === 'Conectado' || status === 'open';
  const aguardandoQR = status === 'Aguardando Leitura do QR Code' || status === 'notLogged' || status === 'Desconectado' || status === 'close';
  const isVerificando = status === 'Buscando...' || status === 'Iniciando...' || status === 'Iniciando motor...' || status === 'connecting';

  return (
    <div className="space-y-6 px-1 sm:px-4 max-w-xl mx-auto w-full overflow-hidden">
      
      {/* CONTAINER DO PAINEL DE CONEXÃO */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
        
        {/* CABEÇALHO DO PAINEL */}
        <div className="bg-royalBlue p-4 text-white font-bold border-b-4 border-gold flex justify-between items-center text-xs sm:text-sm gap-2">
          <span className="truncate">Painel do Robô de Disparos - Ótica Luz</span>
          <button onClick={checarStatusConexao} className="p-1.5 hover:bg-white/10 rounded-lg shrink-0 transition-colors" title="Atualizar Status">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 flex flex-col items-center justify-center space-y-6">
          
          {/* INDICADORES DE STATUS */}
          <div className="flex items-center space-x-3 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 w-full justify-center text-center">
            {isConectado ? (
              <>
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-emerald-700">Sistema Ativo e Conectado!</span>
              </>
            ) : isVerificando ? (
              <>
                <Loader2 className="w-5 h-5 text-royalBlue animate-spin shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-slate-600">Sincronizando serviços...</span>
              </>
            ) : aguardandoQR ? (
              <>
                <Loader2 className="w-5 h-5 text-amber-500 animate-spin shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-amber-600">Aguardando leitura do QR Code...</span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-rose-600 break-all">Status: {status}</span>
              </>
            )}
          </div>

          {/* CONTAINER DO QR CODE ADAPTÁVEL */}
          {aguardandoQR && (
            <div className="flex flex-col items-center space-y-4 bg-slate-50 p-4 sm:p-6 rounded-xl border border-dashed border-slate-300 shadow-inner w-full">
              {qr ? (
                <>
                  <div className="w-full max-w-[240px] sm:max-w-[256px] aspect-square bg-white rounded-lg shadow-md p-2 flex items-center justify-center">
                    <img src={qr} alt="WhatsApp QR Code" className="max-w-full h-auto rounded-md" />
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 text-center max-w-xs font-medium mt-1 leading-relaxed">
                    Abra o WhatsApp no celular da loja, vá em <strong>Aparelhos Conectados</strong> e escaneie o código acima.
                  </p>
                </>
              ) : (
                <div className="w-full max-w-[256px] aspect-square flex flex-col items-center justify-center space-y-2">
                  <Loader2 className="w-7 h-7 text-slate-300 animate-spin" />
                  <p className="text-[11px] sm:text-xs text-slate-400 font-medium text-center">Aguardando geração do token seguro...</p>
                </div>
              )}
            </div>
          )}

          {/* BOTOES DE AÇÃO */}
          {isConectado && (
            <div className="text-center space-y-4 w-full">
              <p className="text-[11px] sm:text-xs text-slate-400 font-medium leading-relaxed">
                O chip está pareado e enviando mensagens de aniversário e pós-venda de forma automática todos os dias.
              </p>
              <button
                type="button"
                onClick={handleDesconectar}
                disabled={carregando}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-lg text-xs sm:text-sm shadow transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 h-10 active:scale-[0.99]"
              >
                {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Desconectar Aparelho</span>}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 🔥 NOVO: CONTAINER DE CONFIGURAÇÃO DE MENSAGENS EDITÁVEIS */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
        <div className="bg-slate-900 p-4 text-white font-bold border-b-4 border-gold flex items-center space-x-2 text-xs sm:text-sm">
          <MessageSquare className="w-4 h-4 text-gold" />
          <span>Personalizar Textos das Automações</span>
        </div>
        
        <form onSubmit={handleSalvarMensagens} className="p-4 sm:p-6 space-y-5">
          {/* TEMPLATE ANIVERSÁRIO */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">Mensagem de Aniversário</label>
              <span className="text-[10px] bg-royalBlue/10 text-royalBlue px-2 py-0.5 rounded font-mono font-bold">Tag: {"{nome}"}</span>
            </div>
            <textarea
              rows="4"
              value={msgAniversario}
              onChange={(e) => setMsgAniversario(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-3 text-xs sm:text-sm focus:outline-none focus:border-royalBlue bg-white font-normal text-slate-700 leading-relaxed resize-none"
              placeholder="Escreva a mensagem de parabéns..."
              required
            />
          </div>

          {/* TEMPLATE PÓS-VENDA */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">Mensagem de Pós-Venda (30 dias)</label>
              <div className="flex space-x-1">
                <span className="text-[10px] bg-royalBlue/10 text-royalBlue px-1.5 py-0.5 rounded font-mono font-bold">{"{nome}"}</span>
                <span className="text-[10px] bg-gold/20 text-gold-dark px-1.5 py-0.5 rounded font-mono font-bold">{"{produtos}"}</span>
              </div>
            </div>
            <textarea
              rows="4"
              value={msgPosVenda}
              onChange={(e) => setMsgPosVenda(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-3 text-xs sm:text-sm focus:outline-none focus:border-royalBlue bg-white font-normal text-slate-700 leading-relaxed resize-none"
              placeholder="Escreva a mensagem de acompanhamento pós-venda..."
              required
            />
          </div>

          {/* BOTÃO DE SALVAR MODELOS */}
          <button
            type="submit"
            disabled={salvandoConfig}
            className="w-full bg-royalBlue hover:bg-royalBlue-light text-white font-bold py-2.5 rounded-lg text-xs sm:text-sm shadow transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 h-10 border-b-2 border-gold active:scale-[0.99]"
          >
            {salvandoConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <>
                <Save className="w-4 h-4 text-gold" />
                <span>Salvar Templates de Mensagem</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* MODAL DE ALERTA E CONFIRMAÇÃO INTEGRADO */}
      {alertaConfig.aberto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-gold">
            <div className="p-5 space-y-4">
              <div className="flex items-start space-x-3">
                <div className={`p-2 rounded-xl shrink-0 ${
                  alertaConfig.tipo === 'confirmacao' || alertaConfig.tipo === 'aviso'
                    ? 'bg-amber-50 text-amber-600' 
                    : alertaConfig.tipo === 'sucesso' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  {alertaConfig.tipo === 'erro' ? <XCircle className="w-6 h-6" /> : alertaConfig.tipo === 'sucesso' ? <CheckCircle className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                </div>
                <div className="space-y-1 min-w-0">
                  <h3 className="text-base font-bold text-slate-800 tracking-tight">{alertaConfig.titulo}</h3>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">{alertaConfig.mensagem}</p>
                </div>
              </div>

              <div className="flex space-x-2 pt-2 justify-end">
                {alertaConfig.tipo === 'confirmacao' ? (
                  <>
                    <button 
                      type="button" 
                      onClick={() => setAlertaConfig(prev => ({ ...prev, aberto: false }))} 
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors"
                    >
                      Não, manter
                    </button>
                    <button 
                      type="button" 
                      onClick={() => {
                        if (alertaConfig.onConfirmar) alertaConfig.onConfirmar();
                        setAlertaConfig(prev => ({ ...prev, aberto: false }));
                      }} 
                      className="bg-royalBlue text-white px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold border-b-2 border-gold shadow-sm transition-colors"
                    >
                      Sim, executar
                    </button>
                  </>
                ) : (
                  <button 
                    type="button" 
                    onClick={() => setAlertaConfig(prev => ({ ...prev, aberto: false }))} 
                    className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors"
                  >
                    Entendido
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}