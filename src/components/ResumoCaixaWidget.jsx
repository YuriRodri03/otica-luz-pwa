import React from 'react'
import { ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react'

export default function ResumoCaixaWidget({ lancamentos }) {
  // Regra Contábil: Filtra e calcula apenas as movimentações que aconteceram no dia de hoje
  const hojeStr = new Date().toISOString().split('T')[0]

  const totalEntradasHoje = lancamentos
    .filter(item => item.tipo === 'entrada' && (item.data?.startsWith(hojeStr) || new Date(item.id).toISOString().startsWith(hojeStr)))
    .reduce((sum, item) => sum + item.valor, 0)

  const totalSaidasHoje = lancamentos
    .filter(item => item.tipo === 'saida' && (item.data?.startsWith(hojeStr) || new Date(item.id).toISOString().startsWith(hojeStr)))
    .reduce((sum, item) => sum + item.valor, 0)

  const saldoLiquidoHoje = totalEntradasHoje - totalSaidasHoje

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm mb-6 w-full">
      
      {/* CARD ENTRADAS */}
      <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">Faturamento (Hoje)</span>
          <span className="text-base sm:text-lg font-extrabold text-emerald-700 block truncate" title={totalEntradasHoje.toFixed(2)}>
            R$ {totalEntradasHoje.toFixed(2)}
          </span>
        </div>
        <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
          <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </div>

      {/* CARD SAÍDAS */}
      <div className="p-3 bg-rose-50/50 rounded-lg border border-rose-100 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">Despesas (Hoje)</span>
          <span className="text-base sm:text-lg font-extrabold text-rose-700 block truncate" title={totalSaidasHoje.toFixed(2)}>
            R$ {totalSaidasHoje.toFixed(2)}
          </span>
        </div>
        <div className="p-2 bg-rose-100 text-rose-700 rounded-lg shrink-0">
          <ArrowDownRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </div>

      {/* CARD SALDO EM CAIXA */}
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">Saldo Líquido</span>
          <span className={`text-base sm:text-lg font-extrabold block truncate ${saldoLiquidoHoje >= 0 ? 'text-royalBlue' : 'text-rose-600'}`} title={saldoLiquidoHoje.toFixed(2)}>
            R$ {saldoLiquidoHoje.toFixed(2)}
          </span>
        </div>
        <div className="p-2 bg-slate-200 text-slate-600 rounded-lg shrink-0">
          <Wallet className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </div>

    </div>
  )
}