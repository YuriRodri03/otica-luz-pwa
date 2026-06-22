import React, { useState } from 'react'
import { ArrowUpRight, ArrowDownRight, Wallet, Calendar, Filter } from 'lucide-react'

export default function ResumoCaixaWidget({ lancamentos }) {
  // Ajustando a data padrão para o dia atual local (Fortaleza)
  const obterDataLocalHoje = () => {
    const d = new Date()
    const offset = d.getTimezoneOffset()
    const local = new Date(d.getTime() - (offset * 60 * 1000))
    return local.toISOString().split('T')[0]
  }

  // ==========================================
  // ESTADOS DE INTERATIVIDADE ATIVA
  // ==========================================
  const [dataSelecionada, setDataSelecionada] = useState(obterDataLocalHoje())
  const [metodoSelecionado, setMetodoSelecionado] = useState('todos')

  // 1. Filtra os lançamentos pela data interativa escolhida pelo usuário
  const lancamentosDaData = lancamentos.filter(item => {
    const dataItem = item.data?.startsWith(dataSelecionada) || 
                     new Date(item.id).toISOString().startsWith(dataSelecionada)
    return dataItem
  })

  // 2. Filtra os lançamentos pelo método de pagamento escolhido nos botões rápidos
  const lancamentosFiltrados = lancamentosDaData.filter(item => {
    return metodoSelecionado === 'todos' || item.metodo === metodoSelecionado
  })

  // 3. Cálculos dinâmicos baseados nas interações
  const totalEntradas = lancamentosFiltrados
    .filter(item => item.tipo === 'entrada' && item.paga !== false)
    .reduce((sum, item) => sum + item.valor, 0)

  const totalSaidas = lancamentosFiltrados
    .filter(item => item.tipo === 'saida' && item.paga === true)
    .reduce((sum, item) => sum + item.valor, 0)

  const saldoLiquido = totalEntradas - totalSaidas

  return (
    <div className="space-y-4 mb-6 w-full">
      
      {/* BARRA DE CONTROLE INTERATIVA */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
        
        {/* SELETOR DE DATA DINÂMICO */}
        <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-lg border border-slate-300 shadow-sm w-full sm:w-auto">
          <Calendar className="w-4 h-4 text-royalBlue shrink-0" />
          <input 
            type="date" 
            value={dataSelecionada}
            onChange={(e) => setDataSelecionada(e.target.value)}
            className="text-xs sm:text-sm font-semibold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
          />
        </div>

        {/* FILTROS RÁPIDOS POR MÉTODO */}
        <div className="flex items-center space-x-1 overflow-x-auto whitespace-nowrap scrollbar-none w-full sm:w-auto pb-1 sm:pb-0">
          <Filter className="w-3.5 h-3.5 text-slate-400 mr-1 hidden sm:inline-block" />
          {['todos', 'Pix', 'Boleto', 'Dinheiro', 'Cartão de Crédito', 'Crediário'].map((metodo) => (
            <button
              key={metodo}
              onClick={() => setMetodoSelecionado(metodo)}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all border ${
                metodoSelecionado === metodo
                  ? 'bg-royalBlue text-white border-royalBlue shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {metodo === 'todos' ? 'Ver Todos' : metodo}
            </button>
          ))}
        </div>
      </div>

      {/* CARDS VISUAIS DINÂMICOS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm">
        
        {/* CARD ENTRADAS */}
        <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">Faturamento Filtrado</span>
            <span className="text-base sm:text-lg font-extrabold text-emerald-700 block truncate">
              R$ {totalEntradas.toFixed(2)}
            </span>
          </div>
          <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
            <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* CARD SAÍDAS */}
        <div className="p-3 bg-rose-50/50 rounded-lg border border-rose-100 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">Custos Liquidados</span>
            <span className="text-base sm:text-lg font-extrabold text-rose-700 block truncate">
              R$ {totalSaidas.toFixed(2)}
            </span>
          </div>
          <div className="p-2 bg-rose-100 text-rose-700 rounded-lg shrink-0">
            <ArrowDownRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* CARD SALDO EM CAIXA */}
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">Saldo do Período</span>
            <span className={`text-base sm:text-lg font-extrabold block truncate ${saldoLiquido >= 0 ? 'text-royalBlue' : 'text-rose-600'}`}>
              R$ {saldoLiquido.toFixed(2)}
            </span>
          </div>
          <div className="p-2 bg-slate-200 text-slate-600 rounded-lg shrink-0">
            <Wallet className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

      </div>

      {/* CONTEXTO DA AUDITORIA ATIVA */}
      <p className="text-[10px] sm:text-xs text-slate-400 italic text-right px-1">
        Exibindo {lancamentosFiltrados.length} ordens encontradas para o dia e filtro selecionados.
      </p>
    </div>
  )
}