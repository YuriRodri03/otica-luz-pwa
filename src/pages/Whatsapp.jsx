import React, { useState, useEffect } from 'react';
import { QrCode, RefreshCw, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';

export default function WhatsappControl() {
  const [status, setStatus] = useState('Buscando...');
  const [qr, setQr] = useState(null);
  const [carregando, setCarregando] = useState(false);

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

  // Monitoramento ativo a cada 5 segundos
  useEffect(() => {
    checarStatusConexao();
    const intervalo = setInterval(checarStatusConexao, 5000);
    return () => clearInterval(intervalo);
  }, []);

  // ==========================================
  // DESCONEXÃO DO CONTEXTO (USANDO MODAL CUSTOM)
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

  // Centralização das validações de estado para o layout
  const isConectado = status === 'Conectado' || status === 'inChat' || status === 'isLogged';
  const aguardandoQR = status === 'Aguardando Leitura do QR Code' || status === 'notLogged' || status === 'Desconectado';

  return (
    <div className="space-y-6 px-1 sm:px-4 max-w-xl mx-auto w-full overflow-hidden">
      
      {/* CONTAINER DO PAINEL */}
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
            ) : status === 'Buscando...' || status === 'Iniciando...' ? (
              <>
                <Loader2 className="w-5 h-5 text-royalBlue animate-spin shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-slate-600">Verificando serviços...</span>
              </>
            ) : aguardandoQR ? (
              <>
                <Loader2 className="w-5 h-5 text-amber-500 animate-spin shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-amber-600">Aguardando leitura do QR Code...</span>
              </>
            ) : status === 'browserClose' ? (
              <>
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 animate-pulse" />
                <span className="text-xs sm:text-sm font-bold text-amber-700">Reiniciando motor de renderização (RAM)...</span>
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
                  <p className="text-[11px] sm:text-xs text-slate-400 font-medium text-center">Gerando nova imagem de pareamento...</p>
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

      {/* 🔔 MODAL DE ALERTA E CONFIRMAÇÃO INTEGRADO DA ÓTICA LUZ */}
      {alertaConfig.aberto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-gold animate-scaleIn">
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