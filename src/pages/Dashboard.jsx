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
  const [abaAtiva, setAbaAtiva] = useState('anual')
  const [carregando, setCarregando] = useState(true)

  // FILTROS DE TEMPO UNIFICADOS
  const dataAtual = new Date()
  const [mesFiltro, setMesFiltro] = useState(dataAtual.getMonth() + 1)
  const [anoFiltro, setAnoFiltro] = useState(dataAtual.getFullYear())
  const [anoFiltroAnual, setAnoFiltroAnual] = useState(dataAtual.getFullYear())
  
  const [metodoFiltroTabela, setMetodoFiltroTabela] = useState('todos')

  // ESTADOS FINANCEIROS
  const [metricasAnuais, setMetricasAnuais] = useState({
    clientes: 0,
    patrimonio: 0, 
    ticketMedio: 0,
    inadimplencia: "0.0%" 
  })
  const [dadosAnuais, setDadosAnuais] = useState([])
  const [vendasMensais, setVendasMensais] = useState([])
  const [totalDespesasPagasMes, setTotalDespesasPagasMes] = useState(0)
  const [totalParcelasPagasMes, setTotalParcelasPagasMes] = useState(0)
  const [dadosLinha, setDadosLinha] = useState([])
  const [dadosPizza, setDadosPizza] = useState([])

  // FUNÇÃO AUXILIAR DE FORMATAÇÃO EM REAL (BRL)
  const formatarParaReal = (valor) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valor)
  }

  // FUNÇÃO EXCLUSIVA PARA OS EIXOS
  const formatarEixoReal = (valor) => {
    return `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const carregarDashboard = async () => {
    setCarregando(true)
    try {
      // 1. CLIENTES COMPRADORES ATIVOS NO ANO ESPECÍFICO
      const resClientesAno = await turso.execute(`
        SELECT COUNT(DISTINCT cliente_id) as total 
        FROM vendas 
        WHERE strftime('%Y', criado_em) = '${anoFiltroAnual}'
      `)

      // 2. BUSCA CORRIGIDA DE ENTRADAS, PARCELAS E DESPESAS (Regime de Caixa Misto)
      const resFluxoAnual = await turso.execute(`
        SELECT 
          mes,
          SUM(entradas) as total_entradas,
          SUM(parcelas) as total_parcelas,
          SUM(despesas) as total_despesas
        FROM (
          SELECT 
            strftime('%m', criado_em) as mes, 
            CASE 
              WHEN LOWER(metodo_venda) LIKE '%cred%' THEN valor_entrada 
              ELSE total_liquido 
            END as entradas, 
            0 as parcelas, 
            0 as despesas 
          FROM vendas 
          WHERE strftime('%Y', criado_em) = '${anoFiltroAnual}'
          
          UNION ALL
          
          SELECT 
            strftime('%m', 
              CASE 
                WHEN pago_em IS NULL OR TRIM(pago_em) = '' OR LOWER(pago_em) = 'none' OR LOWER(pago_em) = 'nan' 
                THEN data_vencimento 
                ELSE pago_em 
              END
            ) as mes, 
            0 as entradas, 
            valor_parcela as parcelas, 
            0 as despesas 
          FROM parcelas_carne 
          WHERE status = 'Pago' 
            AND strftime('%Y', 
              CASE 
                WHEN pago_em IS NULL OR TRIM(pago_em) = '' OR LOWER(pago_em) = 'none' OR LOWER(pago_em) = 'nan' 
                THEN data_vencimento 
                ELSE pago_em 
              END
            ) = '${anoFiltroAnual}'
          
          UNION ALL
          
          SELECT strftime('%m', data) as mes, 0 as entradas, 0 as parcelas, valor as despesas 
          FROM despesas 
          WHERE paga = 1 AND strftime('%Y', data) = '${anoFiltroAnual}'
        ) 
        GROUP BY mes
      `)

      // 3. ESTRUTURAÇÃO DO GRÁFICO ANUAL
      const mesesLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
      let totalPatrimonioAno = 0

      const formatadoAnual = mesesLabels.map((label, index) => {
        const mesNum = (index + 1).toString().padStart(2, '0')
        const achado = resFluxoAnual.rows.find(r => r.mes === mesNum)
        
        const faturamentoBruto = (achado?.total_entradas || 0) + (achado?.total_parcelas || 0)
        const custosOperacionais = achado?.total_despesas || 0
        const lucroLiquido = faturamentoBruto - custosOperacionais

        totalPatrimonioAno += lucroLiquido

        return { 
          name: label, 
          "Faturamento Bruto": faturamentoBruto,
          "Lucro Líquido": lucroLiquido
        }
      })
      setDadosAnuais(formatadoAnual)

      // 4. TICKET MÉDIO
      const resTicket = await turso.execute(`SELECT AVG(total_liquido) as media FROM vendas WHERE strftime('%Y', criado_em) = '${anoFiltroAnual}'`)

      // 5. TAXA DE INADIMPLÊNCIA
      const hojeStr = new Date().toISOString().split('T')[0]
      const resInadimplencia = await turso.execute(`
        SELECT 
          SUM(CASE WHEN status = 'Pendente' AND data_vencimento < '${hojeStr}' THEN valor_parcela ELSE 0 END) as total_atrasado,
          SUM(valor_parcela) as total_gerado
        FROM parcelas_carne
        WHERE strftime('%Y', data_vencimento) = '${anoFiltroAnual}'
      `)

      let taxaInadimplencia = "0.0%"
      if (resInadimplencia.rows[0] && resInadimplencia.rows[0].total_gerado > 0) {
        const totalAtrasado = resInadimplencia.rows[0].total_atrasado || 0
        const totalGerado = resInadimplencia.rows[0].total_gerado
        taxaInadimplencia = `${((totalAtrasado / totalGerado) * 100).toFixed(1)}%`
      }

      setMetricasAnuais({
        clientes: resClientesAno.rows[0].total || 0,
        patrimonio: totalPatrimonioAno,
        ticketMedio: resTicket.rows[0].media || 0,
        inadimplencia: taxaInadimplencia
      })

      // ==========================================
      // 6. FECHAMENTO MENSAL
      // ==========================================
      const mesFormatado = mesFiltro.toString().padStart(2, '0')
      
      const resVendasMensais = await turso.execute(`
        SELECT v.*, c.nome as cliente_nome 
        FROM vendas v
        JOIN clientes c ON v.cliente_id = c.id
        WHERE strftime('%m', v.criado_em) = '${mesFormatado}' 
        AND strftime('%Y', v.criado_em) = '${anoFiltro}'
        ORDER BY v.criado_em DESC
      `)
      const listaVendas = resVendasMensais.rows
      setVendasMensais(listaVendas)

      // Captura amortizações físicas de crediários pagas NESTE mês específico
      const resParcelasMensais = await turso.execute(`
        SELECT 
          strftime('%d', CASE WHEN pago_em IS NULL OR TRIM(pago_em) = '' OR LOWER(pago_em) = 'none' OR LOWER(pago_em) = 'nan' THEN data_vencimento ELSE pago_em END) as dia, 
          valor_parcela 
        FROM parcelas_carne 
        WHERE status = 'Pago' 
          AND strftime('%m', CASE WHEN pago_em IS NULL OR TRIM(pago_em) = '' OR LOWER(pago_em) = 'none' OR LOWER(pago_em) = 'nan' THEN data_vencimento ELSE pago_em END) = '${mesFormatado}'
          AND strftime('%Y', CASE WHEN pago_em IS NULL OR TRIM(pago_em) = '' OR LOWER(pago_em) = 'none' OR LOWER(pago_em) = 'nan' THEN data_vencimento ELSE pago_em END) = '${anoFiltro}'
      `)
      const listaParcelasPagas = resParcelasMensais.rows
      const somaParcelasDoMes = listaParcelasPagas.reduce((acc, curr) => acc + (curr.valor_parcela || 0), 0)
      setTotalParcelasPagasMes(somaParcelasDoMes)

      const resDespesasMensais = await turso.execute(`
        SELECT strftime('%d', data) as dia, valor FROM despesas
        WHERE strftime('%m', data) = '${mesFormatado}'
        AND strftime('%Y', data) = '${anoFiltro}'
        AND paga = 1
      `)
      const listaDespesas = resDespesasMensais.rows
      
      const totalDespesas = listaDespesas.reduce((acc, curr) => acc + (curr.valor || 0), 0)
      setTotalDespesasPagasMes(totalDespesas)

      // Gráfico de Pizza por Método de Venda do Mês
      const resMetodos = await turso.execute(`
        SELECT metodo_venda, SUM(total_liquido) as total FROM vendas 
        WHERE strftime('%m', criado_em) = '${mesFormatado}' AND strftime('%Y', criado_em) = '${anoFiltro}'
        GROUP BY metodo_venda
      `)
      const CORES = ['#002060', '#D4AF37', '#8D6E63', '#AA7C11']
      setDadosPizza(resMetodos.rows.map((r, i) => ({ name: r.metodo_venda, value: r.total, color: CORES[i % CORES.length] })))

      // Montando o Gráfico Diário Consolidando Vendas à Vista + Entradas + Parcelas Recebidas
      const diasNoMes = new Date(anoFiltro, mesFiltro, 0).getDate()
      const mapaDias = {}
      
      for (let i = 1; i <= diasNoMes; i++) {
        mapaDias[i.toString().padStart(2, '0')] = { faturamentoCaixa: 0, despesasReal: 0 }
      }

      // Adiciona entradas imediatas (Crediário) e vendas normais completas (Dinheiro/Cartão/Pix)
      listaVendas.forEach(v => {
        const dia = new Date(v.criado_em).getDate().toString().padStart(2, '0')
        const valorEntradoEfetivo = v.metodo_venda?.toLowerCase().includes('cred')
          ? (v.valor_entrada || 0)
          : (v.total_liquido || 0)
          
        if (mapaDias[dia]) mapaDias[dia].faturamentoCaixa += valorEntradoEfetivo
      })

      // Adiciona os pagamentos de parcelas recebidas no dia correspondente
      listaParcelasPagas.forEach(p => {
        if (mapaDias[p.dia]) mapaDias[p.dia].faturamentoCaixa += (p.valor_parcela || 0)
      })

      listaDespesas.forEach(d => {
        if (mapaDias[d.dia]) mapaDias[d.dia].despesasReal += (d.valor || 0)
      })

      const dadosLinhaFormatados = Object.keys(mapaDias).sort().map(dia => ({
        name: `Dia ${dia}`,
        "Saldo Diário": mapaDias[dia].faturamentoCaixa - mapaDias[dia].despesasReal
      }))
      setDadosLinha(dadosLinhaFormatados)

    } catch (e) {
      console.error("Erro na leitura relacional do Dashboard:", e)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarDashboard()
  }, [mesFiltro, anoFiltro, anoFiltroAnual])

  const vendasFiltradasTabela = vendasMensais.filter(v => {
    return metodoFiltroTabela === 'todos' || v.metodo_venda === metodoFiltroTabela
  })

  // Soma de todos os pedidos no mês, independente de estarem pagos (Competência)
  const faturamentoMensalTotal = vendasMensais.reduce((sum, v) => sum + v.total_liquido, 0)
  
  // Total exato que pingou no caixa (Dinheiro/PIX/Cartão Integral + Entradas de Crediário)
  const totalEntradasCaixaMensal = vendasMensais.reduce((sum, v) => {
    return sum + (v.metodo_venda?.toLowerCase().includes('cred')
      ? (v.valor_entrada || 0)
      : (v.total_liquido || 0))
  }, 0)
  
  // Caixa Líquido Real = (Caixa Imediato + Parcelas do Carnê Recebidas) - Despesas do mês
  const caixaImediatoMensal = (totalEntradasCaixaMensal + totalParcelasPagasMes) - totalDespesasPagasMes

  if (carregando) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-royalBlue px-4 text-center">
        <Loader2 className="w-12 h-12 animate-spin mb-4" />
        <p className="font-bold animate-pulse">Computando relatórios anuais e fechamentos das tabelas...</p>
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
            {abaAtiva === 'anual' ? `Desempenho financeiro consolidado do ano de ${anoFiltroAnual}.` : 'Auditoria e fechamento operacional unificado (Vendas e Custos).'}
          </p>
        </div>

        <div className="flex items-center justify-between sm:justify-end space-x-3 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm w-full sm:w-auto">
          {abaAtiva === 'anual' ? (
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filtrar Ano:</span>
              <input 
                type="number" 
                value={anoFiltroAnual} 
                onChange={(e) => setAnoFiltroAnual(Number(e.target.value))} 
                className="w-20 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 text-xs sm:text-sm font-bold text-slate-700 focus:outline-none text-center focus:border-royalBlue" 
              />
            </div>
          ) : (
            <>
              <select value={mesFiltro} onChange={(e) => setMesFiltro(Number(e.target.value))} className="border-0 bg-transparent text-xs sm:text-sm font-semibold text-slate-700 focus:outline-none cursor-pointer">
                <option value="1">Janeiro</option><option value="2">Fevereiro</option><option value="3">Março</option><option value="4">Abril</option>
                <option value="5">Maio</option><option value="6">Junho</option><option value="7">Julho</option><option value="8">Agosto</option>
                <option value="9">Setembro</option><option value="10">Outubro</option><option value="11">Novembro</option><option value="12">Dezembro</option>
              </select>
              <div className="h-4 w-px bg-slate-200" />
              <input type="number" value={anoFiltro} onChange={(e) => setAnoFiltro(Number(e.target.value))} className="w-16 bg-transparent text-xs sm:text-sm font-bold text-slate-700 focus:outline-none text-center" />
            </>
          )}
        </div>
      </header>

      {/* ABAS */}
      <div className="flex space-x-2 border-b border-slate-200 mb-2 overflow-x-auto whitespace-nowrap scrollbar-none">
        <button onClick={() => setAbaAtiva('anual')} className={`py-2 px-3 sm:px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all ${abaAtiva === 'anual' ? 'border-gold text-royalBlue font-bold' : 'border-transparent text-slate-400'}`}>Desempenho Anual</button>
        <button onClick={() => setAbaAtiva('mensal')} className={`py-2 px-3 sm:px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all ${abaAtiva === 'mensal' ? 'border-gold text-royalBlue font-bold' : 'border-transparent text-slate-400'}`}>Fechamento Mensal</button>
      </div>

      {abaAtiva === 'anual' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
              <div className="p-3 bg-royalBlue/10 text-royalBlue rounded-xl shrink-0"><Award className="w-5 h-5 sm:w-6 sm:h-6" /></div>
              <div><span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase block">Caixa Líquido ({anoFiltroAnual})</span><p className="text-lg sm:text-xl font-bold text-slate-800">{formatarParaReal(metricasAnuais.patrimonio)}</p></div>
            </div>
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
              <div className="p-3 bg-gold/10 text-gold-dark rounded-xl shrink-0"><Users className="w-5 h-5 sm:w-6 sm:h-6" /></div>
              <div><span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase block">Clientes Compradores ({anoFiltroAnual})</span><p className="text-lg sm:text-xl font-bold text-slate-800">{metricasAnuais.clientes} ativos</p></div>
            </div>
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0"><TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" /></div>
              <div><span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase block">Ticket Médio ({anoFiltroAnual})</span><p className="text-lg sm:text-xl font-bold text-slate-800">{formatarParaReal(metricasAnuais.ticketMedio)}</p></div>
            </div>
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0"><ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6" /></div>
              <div><span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase block">Inadimplência ({anoFiltroAnual})</span><p className="text-lg sm:text-xl font-bold text-slate-800">{metricasAnuais.inadimplencia}</p></div>
            </div>
          </div>
          
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-2 mb-6"><BarChart3 className="w-4 h-4 text-royalBlue" /><h3 className="font-bold text-royalBlue text-xs sm:text-sm uppercase">Curva Balanço Comercial ({anoFiltroAnual})</h3></div>
            <div className="h-60 sm:h-80 min-h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={dadosAnuais} margin={{ top: 10, right: 10, left: 15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={10} tickLine={false} />
                  <YAxis fontSize={10} tickLine={false} tickFormatter={formatarEixoReal} />
                  <Tooltip formatter={(value) => formatarParaReal(value)} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="Faturamento Bruto" fill="#002060" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Lucro Líquido" fill="#D4AF37" radius={[4, 4, 0, 0]} />
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
              <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase block mb-1">Vendas Emitidas (Mês)</span>
              <p className="text-xl sm:text-2xl font-bold text-slate-800">{formatarParaReal(faturamentoMensalTotal)}</p>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 bg-white">
              <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase block mb-1">Despesas Pagas (Mês)</span>
              <p className="text-xl sm:text-2xl font-bold text-rose-600">{formatarParaReal(totalDespesasPagasMes)}</p>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 bg-white">
              <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase block mb-1">Saldo Líquido em Caixa</span>
              <p className={`text-xl sm:text-2xl font-bold ${caixaImediatoMensal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {formatarParaReal(caixaImediatoMensal)}
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
              <h3 className="font-bold text-royalBlue text-xs sm:text-sm uppercase mb-6">Tendência de Fluxo de Caixa Diário</h3>
              <div className="h-56 sm:h-64 min-h-[224px] w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart data={dadosLinha} margin={{ top: 10, right: 10, left: 15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={10} tickLine={false} />
                    <YAxis fontSize={10} tickLine={false} tickFormatter={formatarEixoReal} />
                    <Tooltip formatter={(value) => formatarParaReal(value)} />
                    <Area type="monotone" dataKey="Saldo Diário" stroke="#002060" fill="#002060" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-royalBlue text-xs sm:text-sm uppercase mb-6">Origem Receita</h3>
              <div className="h-56 sm:h-64 min-h-[224px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie data={dadosPizza} innerRadius={45} outerRadius={65} dataKey="value" onClick={(d) => setMetodoFiltroTabela(d.name)} cursor="pointer">
                      {dadosPizza.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value) => formatarParaReal(value)} />
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
                        <td className="p-3 sm:p-4 text-right font-bold text-royalBlue">{formatarParaReal(item.total_liquido)}</td>
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