import React, { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, CalendarDays, Filter } from 'lucide-react'
import { turso } from '../tursoClient'

export default function Crediario() {
  const [carnes, setCarnes] = useState([])
  const [carregando, setCarregando] = useState(false)

  // ==========================================
  // ESTADOS DE FILTRAGEM TEMPORAL
  // ==========================================
  const dataAtual = new Date()
  const [anoSelecionado, setAnoSelecionado] = useState(dataAtual.getFullYear().toString())
  const [mesSelecionado, setMesSelecionado] = useState(String(dataAtual.getMonth() + 1).padStart(2, '0'))
  const [statusFiltro, setStatusFiltro] = useState('urgentes') // 'urgentes', 'todos', 'Pago', 'Atrasado'

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
  const darBaixa = async (item) => {
    const confirmou = window.confirm(`Confirmar recebimento de R$ ${item.valorParcela.toFixed(2)} de ${item.cliente}?`)
    if (!confirmou) return

    try {
      await turso.execute({
        sql: "UPDATE parcelas_carne SET status = 'Pago' WHERE id = ?",
        args: [parseInt(item.idUnique)]
      })

      const descricaoAuditoria = `[Baixa de Carnê] Parcela ${item.parcelaNumero} - Cliente: ${item.cliente} (CPF: ${item.cpf}) | RefChave: ${item.idVendaOrigem}_${item.parcelaNumero.split('/')[0]}`

      await turso.execute({
        sql: "INSERT INTO lancamentos (descricao, tipo, valor, metodo, data) VALUES (?, ?, ?, ?, ?)",
        args: [descricaoAuditoria, 'entrada', item.valorParcela, 'Dinheiro', new Date().toISOString()]
      })

      await carregarCrediarioDoBanco()
      alert("Recebimento liquidado com sucesso!")
    } catch (error) {
      console.error("Erro ao liquidar parcela no Turso:", error)
      alert("Erro ao processar o recebimento no banco de dados.")
    }
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
    </div>
  )
}