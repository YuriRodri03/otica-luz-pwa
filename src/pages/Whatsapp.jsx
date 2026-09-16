import React, { useState, useEffect, useRef } from 'react';
import { QrCode, RefreshCw, CheckCircle, XCircle, Loader2, AlertTriangle, MessageSquare, Save, Power } from 'lucide-react';

export default function WhatsappControl() {
  const [status, setStatus] = useState('Buscando...');
  const [qr, setQr] = useState(null);
  const [carregando, setCarregando] = useState(false);

  // Controle dos templates de mensagens editáveis
  const [msgAniversario, setMsgAniversario] = useState('');
  const [msgPosVenda, setMsgPosVenda] = useState('');
  const [msgUmAno, setMsgUmAno] = useState('');
  
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [carregandoConfig, setCarregandoConfig] = useState(true);

  // ESTADO PARA MODAL DE AVISO / CONFIRMAÇÃO INTEGRADO
  const [alertaConfig, setAlertaConfig] = useState({
    aberto: false,
    tipo: 'aviso',
    titulo: '',
    mensagem: '',
    onConfirmar: null
  });

  const API_URL = import.meta.env.VITE_API_URL || 'https://otica-luz-pwa.onrender.com'; 

  // ==========================================
  // CHECAGEM DE STATUS ADAPTADA PARA O RENDER
  // ==========================================
  const checarStatusConexao = async () => {
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/status`);
      if (!res.ok) throw new Error('Servidor indisponível');
      
      const dados = await res.json();
      setStatus(dados.status || 'Desconectado');
      setQr(dados.qr);
    } catch (error) {
      // Se der erro de conexão, verificamos se não estávamos já no estado de "Acordando"
      setStatus(prev => prev === 'Acordando Servidor...' ? prev : 'Servidor Inativo');
      setQr(null);
    }
  };

  const acordarServidorRender = async () => {
    setStatus('Acordando Servidor...');
    try {
      // O Render no plano free trava o primeiro request por ~50s enquanto liga a máquina
      await fetch(`${API_URL}/api/whatsapp/status`);
      checarStatusConexao();
    } catch (error) {
      console.log("Aguardando boot do Render...");
    }
  };

  const carregarTemplatesMensagens = async () => {
    try {
      setCarregandoConfig(true);
      const res = await fetch(`${API_URL}/api/whatsapp/config-mensagens`);
      if (!res.ok) throw new Error();
      
      const dados = await res.json();
      setMsgAniversario(dados.msg_aniversario || '');
      setMsgPosVenda(dados.msg_pos_venda || '');
      setMsgUmAno(dados.msg_um_ano || ''); 
    } catch (error) {
      // Fallbacks em caso de falha ou servidor dormindo
      setMsgAniversario(prev => prev || 'Olá, {nome}! 🎉 Feliz Aniversário!');
      setMsgPosVenda(prev => prev || 'Olá, {nome}! Obrigado por comprar o produto {produtos}.');
      setMsgUmAno(prev => prev || 'Olá, {nome}! Hoje faz exatamente um ano que você adquiriu {produtos} conosco. Que tal agendar uma nova avaliação da sua visão?');
    } finally {
      setCarregandoConfig(false);
    }
  };

  // Atualiza automaticamente a cada 10 segundos
  useEffect(() => {
    checarStatusConexao();
    carregarTemplatesMensagens();

    const intervalo = setInterval(() => {
      checarStatusConexao();
    }, 10000);

    return () => clearInterval(intervalo);
  }, []);

  const handleSalvarMensagens = async (e) => {
    e.preventDefault();
    setSalvandoConfig(true);
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/config-mensagens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_aniversario: msgAniversario,
          msg_pos_venda: msgPosVenda,
          msg_um_ano: msgUmAno 
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
        mensagem: 'O servidor no Render pode estar dormindo. Acorde-o antes de salvar.',
        onConfirmar: null
      });
    } finally {
      setSalvandoConfig(false);
    }
  };

  // ==========================================
  // DESCONEXÃO FORÇADA
  // ==========================================
  const handleDesconectar = () => {
    setAlertaConfig({
      aberto: true,
      tipo: 'confirmacao',
      titulo: 'Desvincular WhatsApp',
      mensagem: 'Isso limpará a sessão do banco Turso. O robô vai reiniciar e exigirá a leitura de um novo QR Code. Continuar?',
      onConfirmar: async () => {
        setCarregando(true);
        try {
          await fetch(`${API_URL}/api/whatsapp/desconectar`, { method: 'POST' });
          setStatus('Reiniciando...');
          setQr(null);
          
          setAlertaConfig({
            aberto: true,
            tipo: 'sucesso',
            titulo: 'Sessão Limpa',
            mensagem: 'O aparelho foi desconectado e o servidor está reiniciando o motor.',
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

  // Auxiliares de visualização baseados nos status
  const isConectado = status === 'Conectado' || status === 'open';
  const isServerOffline = status === 'Servidor Inativo';
  const isAcordando = status === 'Acordando Servidor...' || status === 'Reiniciando...';
  const isVerificando = status === 'Buscando...' || status === 'Iniciando...' || status === 'Iniciando motor...' || status === 'connecting';
  const aguardandoQR = status === 'Aguardando Leitura do QR Code' || status === 'notLogged' || status === 'Desconectado' || status === 'close';

  return (
    <div className="space-y-6 px-1 sm:px-4 max-w-xl mx-auto w-full overflow-hidden">
      
      {/* CONTAINER DO PAINEL DE CONEXÃO */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
        
        {/* CABEÇALHO DO PAINEL */}
        <div className="bg-royalBlue p-4 text-white font-bold border-b-4 border-gold flex justify-between items-center text-xs sm:text-sm gap-2">
          <span className="truncate">Painel do Motor WhatsApp - Ótica Luz</span>
          <button 
            onClick={() => { setStatus('Buscando...'); checarStatusConexao(); carregarTemplatesMensagens(); }} 
            className="flex items-center space-x-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors border border-white/10 active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(isVerificando || isAcordando) ? 'animate-spin' : ''}`} />
            <span className="text-[10px] uppercase tracking-wider font-bold">Atualizar</span>
          </button>
        </div>

        <div className="p-4 sm:p-6 flex flex-col items-center justify-center space-y-6">
          
          {/* INDICADORES DE STATUS ADAPTADOS PARA O RENDER */}
          <div className="flex items-center space-x-3 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 w-full justify-center text-center">
            {isConectado ? (
              <>
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-emerald-700">Conectado e Disparando!</span>
              </>
            ) : isServerOffline ? (
              <>
                <Power className="w-5 h-5 text-rose-500 shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-rose-600">Servidor em Repouso (Inativo)</span>
              </>
            ) : isAcordando ? (
              <>
                <Loader2 className="w-5 h-5 text-amber-500 animate-spin shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-amber-600">Ligando Máquina no Render (~50s)...</span>
              </>
            ) : isVerificando ? (
              <>
                <Loader2 className="w-5 h-5 text-royalBlue animate-spin shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-slate-600">{status}</span>
              </>
            ) : aguardandoQR ? (
              <>
                <QrCode className="w-5 h-5 text-amber-500 shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-amber-600">QR Code Pendente</span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-slate-400 shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-slate-500 break-all">{status}</span>
              </>
            )}
          </div>

          {/* ESTADO 1: SERVIDOR DORMINDO NO RENDER */}
          {isServerOffline && (
            <div className="flex flex-col items-center space-y-4 bg-rose-50/50 p-4 sm:p-6 rounded-xl border border-rose-200 w-full text-center">
              <AlertTriangle className="w-10 h-10 text-rose-400" />
              <div className="space-y-1">
                <h4 className="font-bold text-rose-700 text-sm">O Render suspendeu a aplicação</h4>
                <p className="text-[11px] sm:text-xs text-rose-600/80 max-w-xs leading-relaxed">
                  Por ser um plano gratuito, o servidor desligou por inatividade. Clique abaixo para enviar o sinal de "acordar".
                </p>
              </div>
              <button
                onClick={acordarServidorRender}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-6 rounded-lg text-xs sm:text-sm shadow-md transition-colors w-full active:scale-[0.99]"
              >
                Ligar Servidor
              </button>
            </div>
          )}

          {/* ESTADO 2: AGUARDANDO QR CODE (QUANDO ACORDAR MAS A SESSÃO NÃO EXISTIR/CAIU) */}
          {aguardandoQR && (
            <div className="flex flex-col items-center space-y-4 bg-slate-50 p-4 sm:p-6 rounded-xl border border-dashed border-slate-300 shadow-inner w-full">
              {qr ? (
                <>
                  <div className="w-full max-w-[240px] sm:max-w-[256px] aspect-square bg-white rounded-lg shadow-md p-2 flex items-center justify-center">
                    <img src={qr} alt="WhatsApp QR Code" className="max-w-full h-auto rounded-md" />
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 text-center max-w-xs font-medium mt-1 leading-relaxed">
                    A sessão anterior foi perdida. Abra o WhatsApp da loja e escaneie o código acima para reconectar.
                  </p>
                </>
              ) : (
                <div className="w-full max-w-[256px] aspect-square flex flex-col items-center justify-center space-y-2">
                  <Loader2 className="w-7 h-7 text-slate-300 animate-spin" />
                  <p className="text-[11px] sm:text-xs text-slate-400 font-medium text-center px-4">O servidor acordou e está gerando o QR Code seguro...</p>
                </div>
              )}
            </div>
          )}

          {/* BOTOES DE AÇÃO */}
          {!isServerOffline && !isAcordando && (
            <div className="w-full pt-2">
              {isConectado ? (
                <div className="space-y-4">
                  <p className="text-[11px] sm:text-xs text-slate-400 text-center font-medium leading-relaxed">
                    O WhatsApp está pareado. As rotinas automáticas de aniversário e pós-venda estão sendo gerenciadas.
                  </p>
                  <button
                    type="button"
                    onClick={handleDesconectar}
                    disabled={carregando}
                    className="w-full bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold py-2.5 rounded-lg border border-slate-200 hover:border-rose-200 text-xs sm:text-sm shadow-sm transition-all h-10"
                  >
                    {carregando ? 'Aguarde...' : 'Desvincular Aparelho e Limpar Sessão'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleDesconectar}
                  disabled={carregando}
                  className="w-full bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 font-bold py-2.5 rounded-lg text-xs sm:text-sm shadow-sm transition-all h-10"
                >
                  {carregando ? 'Aguarde...' : 'A tela travou? Forçar reinicialização'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CONTAINER DE CONFIGURAÇÃO DE MENSAGENS EDITÁVEIS */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
        <div className="bg-slate-900 p-4 text-white font-bold border-b-4 border-gold flex items-center justify-between text-xs sm:text-sm">
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-gold" />
            <span>Personalizar Textos das Automações</span>
          </div>
          {carregandoConfig && (
            <Loader2 className="w-4 h-4 text-gold animate-spin" />
          )}
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
              placeholder="Carregando ou escreva a mensagem de parabéns..."
              required
            />
          </div>

          {/* TEMPLATE PÓS-VENDA 30 DIAS */}
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
              placeholder="Carregando ou escreva a mensagem de acompanhamento pós-venda..."
              required
            />
          </div>

          {/* TEMPLATE PÓS-VENDA 1 ANO */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">Mensagem de Reconquista (1 Ano)</label>
              <div className="flex space-x-1">
                <span className="text-[10px] bg-royalBlue/10 text-royalBlue px-1.5 py-0.5 rounded font-mono font-bold">{"{nome}"}</span>
                <span className="text-[10px] bg-gold/20 text-gold-dark px-1.5 py-0.5 rounded font-mono font-bold">{"{produtos}"}</span>
              </div>
            </div>
            <textarea
              rows="4"
              value={msgUmAno}
              onChange={(e) => setMsgUmAno(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-3 text-xs sm:text-sm focus:outline-none focus:border-royalBlue bg-white font-normal text-slate-700 leading-relaxed resize-none"
              placeholder="Carregando ou escreva a mensagem de reconquista..."
              required
            />
          </div>

          <button
            type="submit"
            disabled={salvandoConfig || carregandoConfig || isServerOffline}
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
                      Não, cancelar
                    </button>
                    <button 
                      type="button" 
                      onClick={() => {
                        if (alertaConfig.onConfirmar) alertaConfig.onConfirmar();
                        setAlertaConfig(prev => ({ ...prev, aberto: false }));
                      }} 
                      className="bg-rose-600 text-white px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold shadow-sm transition-colors hover:bg-rose-700"
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