import React, { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, CalendarDays, Filter, XCircle, CheckCircle } from 'lucide-react'
import { turso } from '../tursoClient'

export default function Crediario() {
  const [carnes, setCarnes] = useState([])
  const [carregando, setCarregando] = useState(false)

  // Estado para capturar a data de recebimento no momento da baixa
  const [dataRecebimento, setDataRecebimento] = useState(new Date().toISOString().split('T')[0])

  // ==========================================
  // ESTADOS DE FILTRAGEM TEMPORAL
  // ==========================================
  const dataAtual = new Date()
  const [anoSelecionado, setAnoSelecionado] = useState(dataAtual.getFullYear().toString())
  const [mesSelecionado, setMesSelecionado] = useState(String(dataAtual.getMonth() + 1).padStart(2, '0'))
  const [statusFiltro, setStatusFiltro] = useState('urgentes') // 'urgentes', 'todos', 'Pago', 'Atrasado'

  // ==========================================
  // ESTADO PARA MODAL DE AVISO / CONFIRMAÇÃO INTEGRADO
  // ==========================================
  const [alertaConfig, setAlertaConfig] = useState({
    aberto: false,
    tipo: 'aviso', // 'confirmacao' | 'erro' | 'sucesso'
    titulo: '',
    mensagem: '',
    onConfirmar: null
  })

  // ==========================================
  // LEITURA DOS CARNÊS DIRETO DAS TABELAS NOVAS
  // ==========================================
  const carregarCrediarioDoBanco = async () => {
    setCarregando(true)
    try {
      const resultado = await turso.execute(`
        SELECT 
          p.id AS parcela_id,
          p.venda_id,
          p.numero_parcela,
          p.valor_parcela,
          p.data_vencimento,
          p.status AS parcela_status,
          v.produtos,
          c.nome AS cliente_nome,
          c.cpf AS cliente_cpf
        FROM parcelas_carne p
        JOIN vendas v ON p.venda_id = v.id
        JOIN clientes c ON v.cliente_id = c.id
        ORDER BY p.data_vencimento ASC
      `)

      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)

      const parcelasFormatadas = resultado.rows.map((row) => {
        const dataVencimentoParcela = new Date(row.data_vencimento + 'T12:00:00')
        dataVencimentoParcela.setHours(0, 0, 0, 0)

        let statusCalculado = row.parcela_status || 'Pendente'
        
        if (statusCalculado !== 'Pago' && dataVencimentoParcela < hoje) {
          statusCalculado = 'Atrasado'
        } else if (statusCalculado !== 'Pago') {
          statusCalculado = 'Em dia'
        }

        return {
          idUnique: row.parcela_id.toString(),
          idVendaOrigem: row.venda_id,
          cliente: row.cliente_nome,
          cpf: row.cliente_cpf,
          parcelaNumero: row.numero_parcela,
          valorParcela: parseFloat(row.valor_parcela),
          vencimento: row.data_vencimento,
          status: statusCalculado,
          produtos: row.produtos || 'Produtos Diversos'
        }
      })

      setCarnes(parcelasFormatadas)
    } catch (error) {
      console.error("Erro ao processar engenharia relacional do crediário:", error)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarCrediarioDoBanco()
  }, [])

  // ==========================================
  // EFETUAR RECEBIMENTO E ATUALIZAR TABELAS
  // ==========================================
  const darBaixa = (item) => {
    // Resetar para a data atual do dia ao abrir um novo recebimento
    setDataRecebimento(new Date().toISOString().split('T')[0])

    setAlertaConfig({
      aberto: true,
      tipo: 'confirmacao',
      titulo: 'Confirmar Recebimento',
      mensagem: `Deseja homologar o recebimento no valor de R$ ${item.valorParcela.toFixed(2)} referente à parcela ${item.parcelaNumero} do cliente ${item.cliente}?`,
      onConfirmar: async (dataEscolhida) => {
        try {
          // 🔥 CORREÇÃO: Passando a data escolhida para a coluna 'pago_em', 
          // garantindo que os relatórios anuais e o dashboard capturem a entrada perfeitamente!
          const dataInjecao = dataEscolhida || new Date().toISOString().split('T')[0];

          await turso.execute({
            sql: "UPDATE parcelas_carne SET status = 'Pago', pago_em = ? WHERE id = ?",
            args: [dataInjecao, parseInt(item.idUnique)]
          })

          await carregarCrediarioDoBanco()
          
          setAlertaConfig({
            aberto: true,
            tipo: 'sucesso',
            titulo: 'Liquidado!',
            mensagem: 'O pagamento foi registrado no carnê com sucesso.',
            onConfirmar: null
          })
        } catch (error) {
          console.error("Erro ao liquidar parcela no Turso:", error)
          setAlertaConfig({
            aberto: true,
            tipo: 'erro',
            titulo: 'Falha Operacional',
            mensagem: 'Não foi possível processar o recebimento no banco de dados.',
            onConfirmar: null
          })
        }
      }
    })
  }

  // ==========================================
  // FILTRAGEM DE COBRANÇA (MÊS CORRENTE / VENCIDOS)
  // ==========================================
  const carnesFiltrados = carnes.filter(item => {
    const [anoItem, mesItem] = item.vencimento.split('-')

    const éMêsAtual = anoItem === anoSelecionado && mesItem === mesSelecionado
    const estáAtrasadoPendente = item.status === 'Atrasado'

    if (statusFiltro === 'urgentes') {
      return éMêsAtual || estáAtrasadoPendente
    }

    const bateAno = anoSelecionado === "todos" || anoItem === anoSelecionado
    const bateMes = mesSelecionado === "todos" || mesItem === mesSelecionado
    const bateStatus = statusFiltro === "todos" || item.status === statusFiltro

    return bateAno && bateMes && bateStatus
  })

  return (
    <div className="space-y-6 px-1 sm:px-4 max-w-full overflow-hidden">
      
      {/* CABEÇALHO RESPONSIVO */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-5 gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-royalBlue tracking-tight">Controle de Crediário Próprio</h2>
          <p className="text-xs sm:text-sm text-slate-500">Cobrança e recebimento focado em vencimentos do período e pendências de carnê.</p>
        </div>

        {/* CONTROLES DE FILTRO ADAPTADOS */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 w-full md:w-auto justify-start md:justify-end">
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400 ml-1 shrink-0" />
            <select 
              value={statusFiltro} 
              onChange={(e) => setStatusFiltro(e.target.value)}
              className="w-full sm:w-auto bg-white border border-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-royalBlue cursor-pointer"
            >
              <option value="urgentes">Mês Atual + Atrasados</option>
              <option value="todos">Ver Todo o Histórico</option>
              <option value="Atrasado">Apenas Atrasados</option>
              <option value="Em dia">Apenas a Vencer</option>
              <option value="Pago">Apenas Pagos</option>
            </select>
          </div>

          {statusFiltro !== 'urgentes' && (
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <select 
                value={mesSelecionado} 
                onChange={(e) => setMesSelecionado(e.target.value)}
                className="w-1/2 sm:w-auto bg-white border border-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-royalBlue cursor-pointer"
              >
                <option value="todos">Todos os Meses</option>
                <option value="01">Janeiro</option><option value="02">Fevereiro</option><option value="03">Março</option><option value="04">Abril</option>
                <option value="05">Maio</option><option value="06">Junho</option><option value="07">Julho</option><option value="08">Agosto</option>
                <option value="09">Setembro</option><option value="10">Outubro</option><option value="11">Novembro</option><option value="12">Dezembro</option>
              </select>

              <select 
                value={anoSelecionado} 
                onChange={(e) => setAnoSelecionado(e.target.value)}
                className="w-1/2 sm:w-auto bg-white border border-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-royalBlue cursor-pointer"
              >
                <option value="todos">Todos os Anos</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </select>
            </div>
          )}
        </div>
      </header>

      {/* GRADE/TABELA COM SUPORTE MÓVEL */}
      {carregando ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 shadow-sm text-center">
          <Loader2 className="w-8 h-8 text-royalBlue animate-spin mb-2" />
          <p className="text-xs sm:text-sm text-slate-500">Sincronizando parcelas relacionais com o Turso...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
          <div className="w-full overflow-x-auto min-w-full inline-block align-middle">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[10px] sm:text-xs uppercase font-semibold border-b border-slate-200">
                  <th className="p-3 sm:p-4">Cliente</th>
                  <th className="p-3 sm:p-4">Item Comprado</th>
                  <th className="p-3 sm:p-4 text-center">Parc.</th>
                  <th className="p-3 sm:p-4">Vencimento</th>
                  <th className="p-3 sm:p-4">Valor Parc.</th>
                  <th className="p-3 sm:p-4">Status</th>
                  <th className="p-3 sm:p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                {carnesFiltrados.length > 0 ? (
                  carnesFiltrados.map((item) => (
                    <tr key={item.idUnique} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 sm:p-4">
                        <p className="font-medium text-slate-700">{item.cliente}</p>
                        <p className="text-[10px] sm:text-[11px] text-slate-400 font-mono">
                          CPF: {item.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") || 'Não informado'}
                        </p>
                      </td>
                      <td className="p-3 sm:p-4 text-xs text-slate-500 max-w-[160px] sm:max-w-[200px] truncate" title={item.produtos}>
                        {item.produtos}
                      </td>
                      <td className="p-3 sm:p-4 text-center font-medium text-slate-600">{item.parcelaNumero}</td>
                      <td className="p-3 sm:p-4 text-slate-500 font-medium">
                        {new Date(item.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </td>
                      <td className="p-3 sm:p-4 font-bold text-royalBlue">R$ {item.valorParcela.toFixed(2)}</td>
                      <td className="p-3 sm:p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold inline-flex items-center space-x-1 ${
                          item.status === 'Pago' ? 'bg-emerald-50 text-emerald-700' :
                          item.status === 'Atrasado' ? 'bg-rose-50 text-rose-700 animate-pulse' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {item.status === 'Pago' && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                          {item.status === 'Atrasado' && <AlertTriangle className="w-3 h-3 shrink-0" />}
                          {item.status === 'Em dia' && <CalendarDays className="w-3 h-3 shrink-0" />}
                          <span>{item.status}</span>
                        </span>
                      </td>
                      <td className="p-3 sm:p-4 text-center">
                        {item.status !== 'Pago' ? (
                          <button 
                            onClick={() => darBaixa(item)}
                            className="bg-gold text-wood-dark hover:bg-gold-dark font-bold text-[11px] sm:text-xs px-3 py-1.5 rounded-lg transition-colors shadow-sm whitespace-nowrap"
                          >
                            Receber Parcela
                          </button>
                        ) : (
                          <span className="text-[11px] sm:text-xs text-emerald-600 font-semibold italic bg-emerald-50 px-2.5 py-1 rounded block sm:inline-block">Caixa Baixado</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="text-center p-8 text-xs sm:text-sm text-slate-400 italic">
                      Nenhuma parcela pendente ou vencendo neste período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 🔔 MODAL DE ALERTA E CONFIRMAÇÃO INTEGRADO DA ÓTICA LUZ */}
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
                <div className="space-y-1 min-w-0 flex-1">
                  <h3 className="text-base font-bold text-slate-800 tracking-tight">{alertaConfig.titulo}</h3>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-3">{alertaConfig.mensagem}</p>
                  
                  {/* INJETANDO SELEÇÃO DE DATA DE RECEBIMENTO EXCLUSIVA PARA CONFIRMAÇÃO DE PAGAMENTO */}
                  {alertaConfig.tipo === 'confirmacao' && (
                    <div className="mt-3 bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Data do Recebimento:</label>
                      <input 
                        type="date" 
                        value={dataRecebimento} 
                        onChange={(e) => setDataRecebimento(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs sm:text-sm font-semibold text-slate-700 focus:outline-none focus:border-royalBlue"
                      />
                    </div>
                  )}
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
                      Não, voltar
                    </button>
                    <button 
                      type="button" 
                      onClick={() => {
                        if (alertaConfig.onConfirmar) alertaConfig.onConfirmar(dataRecebimento);
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
  )
}