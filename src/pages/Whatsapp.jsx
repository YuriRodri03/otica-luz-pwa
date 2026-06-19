import React, { useState, useEffect } from 'react';
import { QrCode, RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function WhatsappControl() {
  const [status, setStatus] = useState('Buscando...');
  const [qr, setQr] = useState(null);
  const [carregando, setCarregando] = useState(false);

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

  const handleDesconectar = async () => {
    if (!window.confirm('Tem certeza que deseja desconectar o WhatsApp da Ótica Luz?')) return;
    setCarregando(true);
    try {
      await fetch(`${API_URL}/api/whatsapp/desconectar`, { method: 'POST' });
      await checarStatusConexao();
    } catch (error) {
      alert('Erro operacional ao desconectar.');
    } finally {
      setCarregando(false);
    }
  };

  // Centralização das validações de estado para o layout
  const isConectado = status === 'Conectado' || status === 'inChat' || status === 'isLogged';
  const aguardandoQR = status === 'Aguardando Leitura do QR Code' || status === 'notLogged' || status === 'Desconectado';

  return (
    <div className="max-w-xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
      
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
                {/* ALTERADO: De 'w-64 h-64' fixo para tamanho responsivo max-w-xs */}
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
              onClick={handleDesconectar}
              disabled={carregando}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-lg text-xs sm:text-sm shadow transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 h-10 sm:h-auto active:scale-[0.99]"
            >
              {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Desconectar Aparelho</span>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}