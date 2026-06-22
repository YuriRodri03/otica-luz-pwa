import React, { useState, useEffect } from 'react'
import { 
  TrendingUp, PieChart as PieIcon, BarChart3, Users, 
  ShieldAlert, Award, Loader2, ArrowDownCircle
} from 'lucide-react'
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, 
  CartesianGrid, PieChart, Pie, Cell, Legend, BarChart, Bar 
} from 'recharts'
import { turso } from '../tursoClient'

export default function Dashboard() {
  const [abaAtiva, setAbaAtiva] = useState('macro')
  const [carregando, setCarregando] = useState(true)

  // FILTROS DE TEMPO (FECHAMENTO MENSAL)
  const dataAtual = new Date()
  const [mesFiltro, setMesFiltro] = useState(dataAtual.getMonth() + 1)
  const [anoFiltro, setAnoFiltro] = useState(dataAtual.getFullYear())
  
  const [metodoFiltroTabela, setMetodoFiltroTabela] = useState('todos')

  // ESTADOS FINANCEIROS MACRO
  const [metricasMacro, setMetricasMacro] = useState({
    clientes: 0,
    patrimonio: 0, 
    ticketMedio: 0,
    inadimplencia: "0.0%" 
  })
  const [dadosAnuais, setDadosAnuais] = useState([])
  const [vendasMensais, setVendasMensais] = useState([])
  const [totalDespesasPagasMes, setTotalDespesasPagasMes] = useState(0) // Novo estado para controle de custos
  const [dadosLinha, setDadosLinha] = useState([])
  const [dadosPizza, setDadosPizza] = useState([])

  // ESTADOS DE CONTROLE DE EXIBIÇÃO DE BARRAS/LEGENDAS
  const [temDados2025, setTemDados2025] = useState(false)
  const [temDados2026, setTemDados2026] = useState(false)

  const carregarDashboard = async () => {
    setCarregando(true)
    try {
      // 1. CONTAGEM TOTAL DE CLIENTES ATIVOS
      const resClientes = await turso.execute("SELECT COUNT(*) as total FROM clientes")
      
      // 2. FUNDO DE RESERVA REAL CORRIGIDO (Entradas + Parcelas - Despesas Efetivamente PAGAS)
      const resCaixaVendas = await turso.execute("SELECT SUM(valor_entrada) as total_entradas FROM vendas")
      const resCaixaParcelas = await turso.execute("SELECT SUM(valor_parcela) as total_parcelas_pagas FROM parcelas_carne WHERE status = 'Pago'")
      const resTotalDespesas = await turso.execute("SELECT SUM(valor) as total_despesas FROM despesas WHERE paga = 1")
      
      const totalEntradasVendas = resCaixaVendas.rows[0].total_entradas || 0
      const totalParcelasPagas = resCaixaParcelas.rows[0].total_parcelas_pagas || 0
      const totalDespesasPagasAcumulado = resTotalDespesas.rows[0].total_despesas || 0
      
      // Descontando as despesas reais pagas do caixa total disponível
      const caixaDisponivelReal = (totalEntradasVendas + totalParcelasPagas) - totalDespesasPagasAcumulado

      // 3. TICKET MÉDIO REAL
      const resTicket = await turso.execute("SELECT AVG(total_liquido) as media FROM vendas")

      // 4. TAXA DE INADIMPLÊNCIA CRONOLÓGICA
      const hojeStr = new Date().toISOString().split('T')[0]
      const resInadimplencia = await turso.execute(`
        SELECT 
          SUM(CASE WHEN status = 'Pendente' AND data_vencimento < '${hojeStr}' THEN valor_parcela ELSE 0 END) as total_atrasado,
          SUM(valor_parcela) as total_gerado
        FROM parcelas_carne
      `)

      let taxaInadimplencia = "0.0%"
      if (resInadimplencia.rows[0] && resInadimplencia.rows[0].total_gerado > 0) {
        const totalAtrasado = resInadimplencia.rows[0].total_atrasado || 0
        const totalGerado = resInadimplencia.rows[0].total_gerado
        taxaInadimplencia = `${((totalAtrasado / totalGerado) * 100).toFixed(1)}%`
      }

      setMetricasMacro({
        clientes: resClientes.rows[0].total || 0,
        patrimonio: caixaDisponivelReal,
        ticketMedio: resTicket.rows[0].media || 0,
        inadimplencia: taxaInadimplencia
      })

      // 5. COMPARATIVO ANUAL DE FATURAMENTO (LÍQUIDO: Vendas - Despesas Pagas)
      const resAnualvendas = await turso.execute(`
        SELECT 
          mes,
          SUM(vendas2025) as v2025, SUM(vendas2026) as v2026,
          SUM(desp2025) as d2025, SUM(desp2026) as d2026
        FROM (
          SELECT strftime('%m', criado_em) as mes, total_liquido as vendas2025, 0 as vendas2026, 0 as desp2025, 0 as desp2026 FROM vendas WHERE strftime('%Y', criado_em) = '2025'
          UNION ALL
          SELECT strftime('%m', criado_em) as mes, 0 as vendas2025, total_liquido as vendas2026, 0 as desp2025, 0 as desp2026 FROM vendas WHERE strftime('%Y', criado_em) = '2026'
          UNION ALL
          SELECT strftime('%m', data) as mes, 0 as vendas2025, 0 as vendas2026, valor as desp2025, 0 as desp2026 FROM despesas WHERE strftime('%Y', data) = '2025' AND paga = 1
          UNION ALL
          SELECT strftime('%m', data) as mes, 0 as vendas2025, 0 as vendas2026, 0 as desp2025, valor as desp2026 FROM despesas WHERE strftime('%Y', data) = '2026' AND paga = 1
        ) GROUP BY mes
      `)
      
      let possuiFaturamento2025 = false
      let possuiFaturamento2026 = false

      const mesesLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
      const formatadoAnual = mesesLabels.map((label, index) => {
        const mesNum = (index + 1).toString().padStart(2, '0')
        const achado = resAnualvendas.rows.find(r => r.mes === mesNum)
        
        // Lucro real = Faturamento - Custos operacionais pagos
        const valor2025 = (achado?.v2025 || 0) - (achado?.d2025 || 0)
        const valor2026 = (achado?.v2026 || 0) - (achado?.d2026 || 0)

        if ((achado?.v2025 || 0) > 0) possuiFaturamento2025 = true
        if ((achado?.v2026 || 0) > 0) possuiFaturamento2026 = true

        return { 
          name: label, 
          "Faturamento 2025": valor2025 < 0 ? 0 : valor2025, 
          "Faturamento 2026": valor2026 < 0 ? 0 : valor2026 
        }
      })
      
      setDadosAnuais(formatadoAnual)
      setTemDados2025(possuiFaturamento2025)
      setTemDados2026(possuiFaturamento2026)

      // 6. MONITORAMENTO MENSAL DETALHADO (VENDAS + DESPESAS DO MÊS SELECIONADO)
      const mesFormatado = mesFiltro.toString().padStart(2, '0')
      
      const resVendasMensais = await turso.execute(`
        SELECT v.*, c.nome as cliente_nome 
        FROM vendas v
        JOIN clientes c ON v.cliente_id = c.id
        WHERE strftime('%m', v.criado_em) = '${mesFormatado}' 
        AND strftime('%Y', v.criado_em) = '${anoFiltro}'
        ORDER BY v.criado_em DESC
      `)
      setVendasMensais(resVendasMensais.rows)

      // Puxa as despesas pagas do mês selecionado para abater nos cards de fechamento
      const resDespesasMensais = await turso.execute(`
        SELECT SUM(valor) as total_mes FROM despesas
        WHERE strftime('%m', data) = '${mesFormatado}'
        AND strftime('%Y', data) = '${anoFiltro}'
        AND paga = 1
      `)
      setTotalDespesasPagasMes(resDespesasMensais.rows[0].total_mes || 0)

      const resMetodos = await turso.execute(`
        SELECT metodo_venda, SUM(total_liquido) as total FROM vendas 
        WHERE strftime('%m', criado_em) = '${mesFormatado}' AND strftime('%Y', criado_em) = '${anoFiltro}'
        GROUP BY metodo_venda
      `)
      const CORES = ['#002060', '#D4AF37', '#8D6E63', '#AA7C11']
      setDadosPizza(resMetodos.rows.map((r, i) => ({ name: r.metodo_venda, value: r.total, color: CORES[i % CORES.length] })))

      // Unifica no gráfico de linha a tendência diária líquida do mês (Vendas - Custos)
      const resDiasMovimentacao = await turso.execute(`
        SELECT dia, SUM(vendas_dia) as v_dia, SUM(despesas_dia) as d_dia FROM (
          SELECT strftime('%d', criado_em) as dia, total_liquido as vendas_dia, 0 as despesas_dia FROM vendas WHERE strftime('%m', criado_em) = '${mesFormatado}' AND strftime('%Y', criado_em) = '${anoFiltro}'
          UNION ALL
          SELECT strftime('%d', data) as dia, 0 as vendas_dia, valor as despesas_dia FROM despesas WHERE strftime('%m', data) = '${mesFormatado}' AND strftime('%Y', data) = '${anoFiltro}' AND paga = 1
        ) GROUP BY dia ORDER BY dia ASC
      `)
      setDadosLinha(resDiasMovimentacao.rows.map(r => ({ name: `Dia ${r.dia}`, "Saldo Diário": (r.v_dia - r.d_dia) })))

    } catch (e) {
      console.error("Erro na transição e leitura relacional do Dashboard:", e)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarDashboard()
  }, [mesFiltro, anoFiltro])

  const vendasFiltradasTabela = vendasMensais.filter(v => {
    return metodoFiltroTabela === 'todos' || v.metodo_venda === metodoFiltroTabela
  })

  // Faturamento Comercial Bruto do mês selecionado
  const faturamentoMensalTotal = vendasMensais.reduce((sum, v) => sum + v.total_liquido, 0)
  
  // Lucro Real Efetivo = Arrecadação de Vendas do mês menos custos liquidados
  const caixaImediatoMensal = vendasMensais.reduce((sum, v) => sum + v.valor_entrada + (v.metodo_venda !== 'Crediário' ? (v.total_liquido - v.valor_entrada) : 0), 0) - totalDespesasPagasMes

  if (carregando) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-royalBlue px-4 text-center">
        <Loader2 className="w-12 h-12 animate-spin mb-4" />
        <p className="font-bold animate-pulse">Computando relatórios das tabelas de vendas e despesas...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 px-2 sm:px-4 max-w-full overflow-hidden">
      
      {/* HEADER */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-royalBlue tracking-tight">Painel Financeiro</h2>
          <p className="text-xs sm:text-sm text-slate-500">
            {abaAtiva === 'macro' ? 'Indicadores patrimoniais líquidos da Ótica Luz.' : 'Auditoria e fechamento operacional unificado (Vendas e Custos).'}
          </p>
        </div>

        {abaAtiva === 'mensal' && (
          <div className="flex items-center justify-between sm:justify-end space-x-3 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm w-full sm:w-auto">
            <select value={mesFiltro} onChange={(e) => setMesFiltro(Number(e.target.value))} className="border-0 bg-transparent text-xs sm:text-sm font-semibold text-slate-700 focus:outline-none cursor-pointer">
              <option value="1">Janeiro</option><option value="2">Fevereiro</option><option value="3">Março</option><option value="4">Abril</option>
              <option value="5">Maio</option><option value="6">Junho</option><option value="7">Julho</option><option value="8">Agosto</option>
              <option value="9">Setembro</option><option value="10">Outubro</option><option value="11">Novembro</option><option value="12">Dezembro</option>
            </select>
            <div className="h-4 w-px bg-slate-200" />
            <input type="number" value={anoFiltro} onChange={(e) => setAnoFiltro(Number(e.target.value))} className="w-16 bg-transparent text-xs sm:text-sm font-bold text-slate-700 focus:outline-none text-center" />
          </div>
        )}
      </header>

      {/* ABAS */}
      <div className="flex space-x-2 border-b border-slate-200 mb-2 overflow-x-auto whitespace-nowrap scrollbar-none">
        <button onClick={() => setAbaAtiva('macro')} className={`py-2 px-3 sm:px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all ${abaAtiva === 'macro' ? 'border-gold text-royalBlue font-bold' : 'border-transparent text-slate-400'}`}>Visão Geral (Macro)</button>
        <button onClick={() => setAbaAtiva('mensal')} className={`py-2 px-3 sm:px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all ${abaAtiva === 'mensal' ? 'border-gold text-royalBlue font-bold' : 'border-transparent text-slate-400'}`}>Fechamento (Mensal)</button>
      </div>

      {abaAtiva === 'macro' ? (
        <div className="space-y-6">
          {/* CARDS MACRO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
              <div className="p-3 bg-royalBlue/10 text-royalBlue rounded-xl shrink-0"><Award className="w-5 h-5 sm:w-6 sm:h-6" /></div>
              <div><span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase block">Caixa Líquido Atual</span><p className="text-lg sm:text-xl font-bold text-slate-800">R$ {metricasMacro.patrimonio.toFixed(2)}</p></div>
            </div>
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
              <div className="p-3 bg-gold/10 text-gold-dark rounded-xl shrink-0"><Users className="w-5 h-5 sm:w-6 sm:h-6" /></div>
              <div><span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase block">Clientes</span><p className="text-lg sm:text-xl font-bold text-slate-800">{metricasMacro.clientes} ativos</p></div>
            </div>
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0"><TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" /></div>
              <div><span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase block">Ticket Médio</span><p className="text-lg sm:text-xl font-bold text-slate-800">R$ {metricasMacro.ticketMedio.toFixed(2)}</p></div>
            </div>
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0"><ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6" /></div>
              <div><span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase block">Inadimplência</span><p className="text-lg sm:text-xl font-bold text-slate-800">{metricasMacro.inadimplencia}</p></div>
            </div>
          </div>
          
          {/* GRÁFICO ANUAL */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-2 mb-6"><BarChart3 className="w-4 h-4 text-royalBlue" /><h3 className="font-bold text-royalBlue text-xs sm:text-sm uppercase">Lucro Líquido Comparativo</h3></div>
            <div className="h-60 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosAnuais} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={10} tickLine={false} />
                  <YAxis fontSize={10} tickLine={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  {temDados2025 && <Bar dataKey="Faturamento 2025" fill="#8D6E63" radius={[4, 4, 0, 0]} />}
                  {temDados2026 && <Bar dataKey="Faturamento 2026" fill="#002060" radius={[4, 4, 0, 0]} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* METRICAS DO MÊS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <div className="p-5 rounded-2xl border border-slate-200 bg-white">
              <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase block mb-1">Vendas Brutas (Mês)</span>
              <p className="text-xl sm:text-2xl font-bold text-slate-800">R$ {faturamentoMensalTotal.toFixed(2)}</p>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 bg-white">
              <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase block mb-1">Despesas Pagas (Mês)</span>
              <p className="text-xl sm:text-2xl font-bold text-rose-600">R$ {totalDespesasPagasMes.toFixed(2)}</p>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 bg-white">
              <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase block mb-1">Saldo Líquido em Caixa</span>
              <p className={`text-xl sm:text-2xl font-bold ${caixaImediatoMensal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                R$ {caixaImediatoMensal.toFixed(2)}
              </p>
            </div>
            <div onClick={() => setMetodoFiltroTabela('todos')} className="bg-royalBlue text-white p-5 rounded-2xl shadow-md border-b-4 border-gold cursor-pointer">
              <span className="text-[10px] sm:text-xs font-bold text-slate-300 uppercase block mb-1">Volume de Pedidos</span>
              <p className="text-xl sm:text-2xl font-bold text-gold">{vendasMensais.length} ordens</p>
            </div>
          </div>

          {/* GRÁFICOS DO MÊS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-royalBlue text-xs sm:text-sm uppercase mb-6">Tendência de Saldo Diário Líquido</h3>
              <div className="h-56 sm:h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dadosLinha} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={10} tickLine={false} />
                    <YAxis fontSize={10} tickLine={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="Saldo Diário" stroke="#002060" fill="#002060" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-royalBlue text-xs sm:text-sm uppercase mb-6">Origem Receita</h3>
              <div className="h-56 sm:h-64 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={dadosPizza} innerRadius={45} outerRadius={65} dataKey="value" onClick={(d) => setMetodoFiltroTabela(d.name)} cursor="pointer">
                      {dadosPizza.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* TABELA */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 p-4 flex justify-between items-center border-b border-slate-200">
              <h3 className="font-bold text-royalBlue text-xs sm:text-sm uppercase">Auditoria de Vendas Homologadas</h3>
              {metodoFiltroTabela !== 'todos' && (
                <button onClick={() => setMetodoFiltroTabela('todos')} className="text-[10px] sm:text-xs font-bold text-white bg-royalBlue px-2.5 py-1 rounded-lg hover:bg-opacity-90 transition-all">Ver Todas</button>
              )}
            </div>
            
            <div className="w-full overflow-x-auto min-w-full inline-block align-middle">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-100 text-slate-400 text-[10px] sm:text-xs uppercase font-bold border-b border-slate-200">
                    <th className="p-3 sm:p-4">Cliente</th>
                    <th className="p-3 sm:p-4">Produtos Adquiridos</th>
                    <th className="p-3 sm:p-4">Método</th>
                    <th className="p-3 sm:p-4 text-right">Valor Líquido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {vendasFiltradasTabela.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="p-8 text-center text-slate-400 font-medium">Nenhuma venda homologada encontrada.</td>
                    </tr>
                  ) : (
                    vendasFiltradasTabela.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 sm:p-4 font-medium text-slate-700">{item.cliente_nome}</td>
                        <td className="p-3 sm:p-4 text-slate-500 max-w-[200px] sm:max-w-[280px] truncate" title={item.produtos}>{item.produtos}</td>
                        <td className="p-3 sm:p-4 text-slate-500 font-semibold">{item.metodo_venda}</td>
                        <td className="p-3 sm:p-4 text-right font-bold text-royalBlue">R$ {item.total_liquido.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}