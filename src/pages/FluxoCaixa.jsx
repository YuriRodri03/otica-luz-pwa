import React, { useState, useEffect } from 'react'
import { ShoppingCart, Loader2, Filter } from 'lucide-react'
import { turso } from '../tursoClient'
import Vendas from './Vendas'

export default function FluxoCaixa({ lancamentos, setLancamentos, clientes }) {
  const [abaAtiva, setAbaAtiva] = useState('vendas')
  const [modalAberto, setModalAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)

  // ==========================================
  // ESTADOS DE FILTRAGEM TEMPORAL (ANO / MÊS)
  // ==========================================
  const dataAtual = new Date()
  const [anoSelecionado, setAnoSelecionado] = useState(dataAtual.getFullYear().toString())
  const [mesSelecionado, setMesSelecionado] = useState(String(dataAtual.getMonth() + 1).padStart(2, '0'))

  // ==========================================
  // ESTADOS DE DESPESAS
  // ==========================================
  const [descDespesa, setDescDespesa] = useState('')
  const [categoriaDespesa, setCategoriaDespesa] = useState('Laboratório (Lentes)')
  const [valorDespesa, setValorDespesa] = useState('')
  const [metodoDespesa, setMetodoDespesa] = useState('Pix')

  // ==========================================
  // SYNC: CARREGAR ENTRADAS (VENDAS) E SAÍDAS (DESPESAS)
  // ==========================================
  const carregarLancamentosDoBanco = async () => {
    setCarregando(true)
    try {
      const resultado = await turso.execute(`
        SELECT 
          v.id as id,
          'Venda: ' || c.nome || ' (' || v.produtos || ')' as descricao,
          'entrada' as tipo,
          v.total_liquido as valor,
          v.metodo_venda as metodo,
          v.criado_em as data
        FROM vendas v
        JOIN clientes c ON v.cliente_id = c.id

        UNION ALL

        SELECT 
          d.id as id,
          d.descricao as descricao,
          'saida' as tipo,
          d.valor as valor,
          d.metodo as metodo,
          d.data as data
        FROM despesas d

        ORDER BY data DESC
      `)
      
      const listaMapeada = resultado.rows.map(row => ({
        id: row.id,
        desc: row.descricao,
        tipo: row.tipo,
        valor: row.valor,
        metodo: row.metodo,
        data: row.data || null
      }))

      setLancamentos(listaMapeada)
    } catch (error) {
      console.error("Erro ao carregar movimentações do caixa:", error)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarLancamentosDoBanco()
  }, [])

  const handleSalvarDespesa = async (e) => {
    e.preventDefault()
    if (!descDespesa || !valorDespesa) return
    const dataOcorrencia = new Date().toISOString()
    const timestampId = Date.now()

    try {
      await turso.execute({
        sql: "INSERT INTO despesas (id, descricao, valor, metodo, data) VALUES (?, ?, ?, ?, ?)",
        args: [
          timestampId, 
          `[${categoriaDespesa}] ${descDespesa}`, 
          parseFloat(valorDespesa), 
          metodoDespesa, 
          dataOcorrencia
        ]
      })

      await carregarLancamentosDoBanco()
      setDescDespesa('')
      setValorDespesa('')
      setModalAberto(false)
    } catch (error) {
      console.error("Erro ao salvar despesa no Turso:", error)
    }
  }

  // ==========================================
  // FILTRAGEM MULTICRITÉRIO BLINDADA
  // ==========================================
  const lancamentosFiltrados = lancamentos.filter(item => {
    const bateAba = abaAtiva === 'vendas' ? item.tipo === 'entrada' : item.tipo === 'saida'
    if (!bateAba) return false

    let dataItem;
    if (item.data && !isNaN(new Date(item.data).getTime()) && new Date(item.data).getFullYear() !== 1970) {
      dataItem = new Date(item.data)
    } else if (item.id && item.id > 100000000000) {
      dataItem = new Date(item.id)
    } else {
      dataItem = new Date()
    }

    const anoItem = dataItem.getFullYear().toString()
    const mesItem = String(dataItem.getMonth() + 1).padStart(2, '0')

    const bateAno = anoSelecionado === "todos" || anoItem === anoSelecionado
    const bateMes = mesSelecionado === "todos" || mesItem === mesSelecionado

    return bateAno && bateMes
  })

  return (
    <div className="space-y-6 px-1 sm:px-4 max-w-full overflow-hidden">
      
      {/* CABEÇALHO RESPONSIVO */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-royalBlue tracking-tight">Movimentação do Caixa</h2>
          <p className="text-xs sm:text-sm text-slate-500">Gerencie vendas automatizadas com autocomplete e saídas operacionais.</p>
        </div>
        <button 
          onClick={() => setModalAberto(true)}
          className="w-full sm:w-auto bg-royalBlue hover:bg-royalBlue-light text-white font-semibold px-5 py-2.5 rounded-xl border-b-2 border-gold shadow-md transition-all text-xs sm:text-sm"
        >
          {abaAtiva === 'vendas' ? '+ Abrir Caixa de Vendas (PDV)' : '+ Registrar Despesa'}
        </button>
      </header>

      {/* SELEÇÃO DE ABAS E BARRA DE FILTROS */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-1 gap-4">
        <div className="flex space-x-2 overflow-x-auto whitespace-nowrap scrollbar-none w-full md:w-auto">
          <button onClick={() => setAbaAtiva('vendas')} className={`py-2 px-3 sm:px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all ${abaAtiva === 'vendas' ? 'border-gold text-royalBlue font-bold' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Vendas (Entradas)</button>
          <button onClick={() => setAbaAtiva('despesas')} className={`py-2 px-3 sm:px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all ${abaAtiva === 'despesas' ? 'border-gold text-royalBlue font-bold' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Despesas e Custos (Saídas)</button>
        </div>

        {/* COMPONENTE DE FILTRO DE ANO E MÊS */}
        <div className="flex items-center space-x-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 w-full md:w-auto justify-start md:justify-end">
          <Filter className="w-4 h-4 text-slate-400 ml-1 shrink-0" />
          
          <select 
            value={mesSelecionado} 
            onChange={(e) => setMesSelecionado(e.target.value)}
            className="w-1/2 md:w-auto bg-white border border-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-royalBlue cursor-pointer"
          >
            <option value="todos">Todos os Meses</option>
            <option value="01">Janeiro</option><option value="02">Fevereiro</option><option value="03">Março</option><option value="04">Abril</option>
            <option value="05">Maio</option><option value="06">Junho</option><option value="07">Julho</option><option value="08">Agosto</option>
            <option value="09">Setembro</option><option value="10">Outubro</option><option value="11">Novembro</option><option value="12">Dezembro</option>
          </select>

          <select 
            value={anoSelecionado} 
            onChange={(e) => setAnoSelecionado(e.target.value)}
            className="w-1/2 md:w-auto bg-white border border-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-royalBlue cursor-pointer"
          >
            <option value="todos">Todos os Anos</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
        </div>
      </div>

      {/* MODAL GERAL RESPONSIVO */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border-t-4 border-gold my-auto">
            
            <div className="bg-royalBlue p-4 text-white flex justify-between items-center">
              <div className="flex items-center space-x-2 min-w-0">
                <ShoppingCart className="w-5 h-5 text-gold shrink-0" />
                <h3 className="font-bold tracking-wide text-xs sm:text-sm truncate">{abaAtiva === 'vendas' ? 'PDV Inteligente - Ótica Luz' : 'Registrar Nova Despesa'}</h3>
              </div>
              <button type="button" onClick={() => setModalAberto(false)} className="text-slate-300 hover:text-white font-bold p-1">✕</button>
            </div>
            
            {abaAtiva === 'vendas' ? (
              <div className="max-h-[85vh] overflow-y-auto">
                <Vendas 
                  setModalAberto={setModalAberto} 
                  carregarLancamentosDoBanco={carregarLancamentosDoBanco} 
                  clientes={clientes} 
                />
              </div>
            ) : (
              /* FORMULÁRIO DE DESPESAS */
              <form onSubmit={handleSalvarDespesa} className="p-4 sm:p-6 space-y-4">
                <div>
                  <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Descrição do Gasto</label>
                  <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-royalBlue" placeholder="Ex: Compra de estojos" value={descDespesa} onChange={(e) => setDescDespesa(e.target.value)} required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Categoria</label>
                    <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none" value={categoriaDespesa} onChange={(e) => setCategoriaDespesa(e.target.value)}>
                      <option value="Laboratório (Lentes)">Laboratório (Lentes)</option>
                      <option value="Fornecedor (Armações)">Fornecedor (Armações)</option>
                      <option value="Aluguel / Estrutura">Aluguel / Estrutura</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Forma de Saída</label>
                    <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none" value={metodoDespesa} onChange={(e) => setMetodoDespesa(e.target.value)}>
                      <option value="Pix">Pix</option>
                      <option value="Boleto">Boleto</option>
                      <option value="Dinheiro">Dinheiro</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Valor Pago (R$)</label>
                  <input type="number" step="0.01" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-royalBlue" placeholder="0,00" value={valorDespesa} onChange={(e) => setValorDespesa(e.target.value)} required />
                </div>
                <div className="flex space-x-3 pt-2">
                  <button type="button" onClick={() => setModalAberto(false)} className="w-1/2 bg-slate-100 py-2 rounded-lg text-xs sm:text-sm text-slate-600 hover:bg-slate-200 transition-colors">Cancelar</button>
                  <button type="submit" className="w-1/2 bg-rose-600 text-white py-2 rounded-lg text-xs sm:text-sm border-b-2 border-rose-800 hover:bg-rose-700 transition-colors font-semibold">Confirmar Saída</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* TABELA DE MOVIMENTAÇÕES COMPATÍVEL COM PWA */}
      {carregando ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 shadow-sm text-center">
          <Loader2 className="w-8 h-8 text-royalBlue animate-spin mb-2" />
          <p className="text-xs sm:text-sm text-slate-500">Buscando lançamentos...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
          <div className="w-full overflow-x-auto min-w-full inline-block align-middle">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[10px] sm:text-xs uppercase font-semibold border-b border-slate-200">
                  <th className="p-3 sm:p-4">Histórico / Descrição</th>
                  <th className="p-3 sm:p-4">Forma Movimentação</th>
                  <th className="p-3 sm:p-4">Tipo</th>
                  <th className="p-3 sm:p-4 text-right">Valor Líquido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                {lancamentosFiltrados.length > 0 ? (
                  lancamentosFiltrados.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 sm:p-4 font-medium text-slate-700 max-w-[260px] sm:max-w-none truncate" title={item.desc}>{item.desc}</td>
                      <td className="p-3 sm:p-4 text-slate-500">{item.metodo}</td>
                      <td className="p-3 sm:p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold ${
                          item.tipo === 'entrada' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {item.tipo === 'entrada' ? 'VENDA' : 'DESPESA'}
                        </span>
                      </td>
                      <td className={`p-3 sm:p-4 text-right font-bold ${item.tipo === 'entrada' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        R$ {item.valor.toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="text-center p-8 text-xs sm:text-sm text-slate-400 italic">
                      Nenhum registro encontrado para o período selecionado.
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