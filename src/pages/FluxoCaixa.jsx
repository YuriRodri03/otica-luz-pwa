import React, { useState, useEffect } from 'react'
import { ShoppingCart, Loader2, Filter, CheckCircle, Trash2, AlertTriangle, XCircle, Pencil, Save } from 'lucide-react'
import { turso } from '../tursoClient'
import Vendas from './Vendas'

export default function FluxoCaixa({ lancamentos, setLancamentos, clientes }) {
  const [abaAtiva, setAbaAtiva] = useState('vendas')
  const [modalAberto, setModalAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)

  // ==========================================
  // ESTADO PARA EDICAO DE LANÇAMENTOS
  // ==========================================
  const [idEmEdicao, setIdEmEdicao] = useState(null) // Controla se o modal está salvando ou atualizando
  const [tipoEmEdicao, setTipoEmEdicao] = useState(null) // 'entrada' ou 'saida'
  const [metodoVendaEdicao, setMetodoVendaEdicao] = useState('Pix')
  const [valorVendaEdicao, setValorVendaEdicao] = useState('')

  // ==========================================
  // ESTADO PARA MODAL DE AVISO / CONFIRMAÇÃO PERSONALIZADO
  // ==========================================
  const [alertaConfig, setAlertaConfig] = useState({
    aberto: false,
    tipo: 'aviso', // 'confirmacao' | 'erro' | 'sucesso'
    titulo: '',
    mensagem: '',
    onConfirmar: null
  })

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
  const [categoriaDespesa, setCategoriaDespesa] = useState('')
  const [valorDespesa, setValorDespesa] = useState('')
  const [metodoDespesa, setMetodoDespesa] = useState('Pix')
  const [despesaPaga, setDespesaPaga] = useState(true)

  // ==========================================
  // SYNC: CARREGAR ENTRADAS E SAÍDAS
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
          v.criado_em as data,
          1 as paga
        FROM vendas v
        JOIN clientes c ON v.cliente_id = c.id

        UNION ALL

        SELECT 
          d.id as id,
          d.descricao as descricao,
          'saida' as tipo,
          d.valor as valor,
          d.metodo as metodo,
          d.data as data,
          COALESCE(d.paga, 1) as paga
        FROM despesas d

        ORDER BY data DESC
      `)
      
      const listaMapeada = resultado.rows.map(row => ({
        id: row.id,
        desc: row.descricao,
        tipo: row.tipo,
        valor: row.valor,
        metodo: row.metodo,
        data: row.data || null,
        paga: Number(row.paga) === 1
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

  // ==========================================
  // ACIONADOR DO MODO DE EDIÇÃO (PREENCHE ESTADOS)
  // ==========================================
  const handleIniciarEdicao = (item) => {
    setIdEmEdicao(item.id)
    setTipoEmEdicao(item.tipo)
    
    if (item.tipo === 'saida') {
      setAbaAtiva('despesas')
      // Decodifica a string "[Categoria] Descrição" para separar nos inputs
      const match = item.desc.match(/^\[(.*?)\]\s*(.*)$/)
      if (match) {
        setCategoriaDespesa(match[1])
        setDescDespesa(match[2])
      } else {
        setCategoriaDespesa('Geral')
        setDescDespesa(item.desc)
      }
      setValorDespesa(item.valor)
      setMetodoDespesa(item.metodo)
      setDespesaPaga(item.paga)
      setModalAberto(true)
    } else {
      setMetodoVendaEdicao(item.metodo)
      setValorVendaEdicao(item.valor)
      setModalAberto(true)
    }
  }

  // ==========================================
  // EXECUTAR EXCLUSÃO (COM MODAL CUSTOM)
  // ==========================================
  const handleDeletarLancamento = (id, tipo) => {
    setAlertaConfig({
      aberto: true,
      tipo: 'confirmacao',
      titulo: 'Confirmar Exclusão',
      mensagem: `Tem certeza que deseja excluir esta ${tipo === 'entrada' ? 'venda' : 'despesa'} permanentemente do banco Turso?`,
      onConfirmar: async () => {
        try {
          if (tipo === 'entrada') {
            await turso.execute({ sql: "DELETE FROM vendas WHERE id = ?", args: [id] })
          } else {
            await turso.execute({ sql: "DELETE FROM despesas WHERE id = ?", args: [id] })
          }
          await carregarLancamentosDoBanco()
          setAlertaConfig({ aberto: true, tipo: 'sucesso', titulo: 'Sucesso', mensagem: 'O registro foi removido com sucesso.', onConfirmar: null })
        } catch (error) {
          setAlertaConfig({ aberto: true, tipo: 'erro', titulo: 'Erro operacional', mensagem: 'Falha ao tentar excluir item do SQLite.', onConfirmar: null })
        }
      }
    })
  }

  // ==========================================
  // SALVAR OU ATUALIZAR REGISTROS
  // ==========================================
  const handleSalvarDespesa = async (e) => {
    e.preventDefault()
    if (!descDespesa || !valorDespesa || !categoriaDespesa) return

    try {
      if (idEmEdicao && tipoEmEdicao === 'saida') {
        // Modo Edição: UPDATE
        await turso.execute({
          sql: "UPDATE despesas SET descricao = ?, valor = ?, metodo = ?, paga = ? WHERE id = ?",
          args: [`[${categoriaDespesa.trim()}] ${descDespesa}`, parseFloat(valorDespesa), metodoDespesa, despesaPaga ? 1 : 0, idEmEdicao]
        })
      } else {
        // Modo Cadastro: INSERT
        const dataOcorrencia = new Date().toISOString()
        await turso.execute({
          sql: "INSERT INTO despesas (id, descricao, valor, metodo, data, paga) VALUES (?, ?, ?, ?, ?, ?)",
          args: [Date.now(), `[${categoriaDespesa.trim()}] ${descDespesa}`, parseFloat(valorDespesa), metodoDespesa, dataOcorrencia, despesaPaga ? 1 : 0]
        })
      }

      await carregarLancamentosDoBanco()
      setDescDespesa('')
      setCategoriaDespesa('')
      setValorDespesa('')
      setIdEmEdicao(null)
      setTipoEmEdicao(null)
      setModalAberto(false)
    } catch (error) {
      console.error("Erro ao processar despesa no Turso:", error)
    }
  }

  const handleSalvarEdicaoVenda = async (e) => {
    e.preventDefault()
    if (!valorVendaEdicao || !idEmEdicao) return

    try {
      await turso.execute({
        sql: "UPDATE vendas SET total_liquido = ?, metodo_venda = ? WHERE id = ?",
        args: [parseFloat(valorVendaEdicao), metodoVendaEdicao, idEmEdicao]
      })
      await carregarLancamentosDoBanco()
      setIdEmEdicao(null)
      setTipoEmEdicao(null)
      setModalAberto(false)
      setAlertaConfig({ aberto: true, tipo: 'sucesso', titulo: 'Venda Atualizada', mensagem: 'Os valores financeiros da venda foram retificados.', onConfirmar: null })
    } catch (error) {
      console.error("Erro ao retificar venda:", error)
    }
  }

  // ==========================================
  // FUNÇÃO DE DAR BAIXA
  // ==========================================
  const handleDarBaixaDespesa = async (id) => {
    try {
      await turso.execute({
        sql: "UPDATE despesas SET paga = 1 WHERE id = ?",
        args: [id]
      })
      await carregarLancamentosDoBanco()
    } catch (error) {
      console.error("Erro ao dar baixa na despesa:", error)
    }
  }

  // ==========================================
  // FILTRAGEM MULTICRITÉRIO
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
      
      {/* CABEÇALHO */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-royalBlue tracking-tight">Movimentação do Caixa</h2>
          <p className="text-xs sm:text-sm text-slate-500">Gerencie vendas automatizadas com autocomplete, custos e lembretes de contas.</p>
        </div>
        <button 
          onClick={() => {
            setIdEmEdicao(null)
            setTipoEmEdicao(null)
            setDescDespesa('')
            setCategoriaDespesa('')
            setValorDespesa('')
            setModalAberto(true)
          }}
          className="w-full sm:w-auto bg-royalBlue hover:bg-royalBlue-light text-white font-semibold px-5 py-2.5 rounded-xl border-b-2 border-gold shadow-md transition-all text-xs sm:text-sm"
        >
          {abaAtiva === 'vendas' ? '+ Abrir Caixa de Vendas (PDV)' : '+ Registrar Despesa / Lembrete'}
        </button>
      </header>

      {/* FILTROS */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-1 gap-4">
        <div className="flex space-x-2 overflow-x-auto whitespace-nowrap scrollbar-none w-full md:w-auto">
          <button onClick={() => setAbaAtiva('vendas')} className={`py-2 px-3 sm:px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all ${abaAtiva === 'vendas' ? 'border-gold text-royalBlue font-bold' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Vendas (Entradas)</button>
          <button onClick={() => setAbaAtiva('despesas')} className={`py-2 px-3 sm:px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all ${abaAtiva === 'despesas' ? 'border-gold text-royalBlue font-bold' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Despesas e Lembretes (Saídas)</button>
        </div>

        <div className="flex items-center space-x-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 w-full md:w-auto justify-start md:justify-end">
          <Filter className="w-4 h-4 text-slate-400 ml-1 shrink-0" />
          
          <select value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)} className="w-1/2 md:w-auto bg-white border border-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-royalBlue cursor-pointer">
            <option value="todos">Todos os Meses</option>
            <option value="01">Janeiro</option><option value="02">Fevereiro</option><option value="03">Março</option><option value="04">Abril</option>
            <option value="05">Maio</option><option value="06">Junho</option><option value="07">Julho</option><option value="08">Agosto</option>
            <option value="09">Setembro</option><option value="10">Outubro</option><option value="11">Novembro</option><option value="12">Dezembro</option>
          </select>

          <select value={anoSelecionado} onChange={(e) => setAnoSelecionado(e.target.value)} className="w-1/2 md:w-auto bg-white border border-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-royalBlue cursor-pointer">
            <option value="todos">Todos os Anos</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
        </div>
      </div>

      {/* MODAL RESPONSIVO FORMULÁRIOS (CADASTRO / EDIÇÃO) */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border-t-4 border-gold my-auto">
            <div className="bg-royalBlue p-4 text-white flex justify-between items-center">
              <div className="flex items-center space-x-2 min-w-0">
                <ShoppingCart className="w-5 h-5 text-gold shrink-0" />
                <h3 className="font-bold tracking-wide text-xs sm:text-sm truncate">
                  {idEmEdicao ? 'Retificar Lançamento Homologado' : abaAtiva === 'vendas' ? 'PDV Inteligente - Ótica Luz' : 'Registrar Saída / Conta a Pagar'}
                </h3>
              </div>
              <button type="button" onClick={() => setModalAberto(false)} className="text-slate-300 hover:text-white font-bold p-1">✕</button>
            </div>
            
            {abaAtiva === 'vendas' && !idEmEdicao ? (
              <div className="max-h-[85vh] overflow-y-auto">
                <Vendas setModalAberto={setModalAberto} carregarLancamentosDoBanco={carregarLancamentosDoBanco} clientes={clientes} />
              </div>
            ) : abaAtiva === 'vendas' && idEmEdicao ? (
              /* FORMULÁRIO EXCLUSIVO PARA RETIFICAÇÃO DE VENDAS */
              <form onSubmit={handleSalvarEdicaoVenda} className="p-4 sm:p-6 space-y-4">
                <div className="bg-amber-50 text-amber-800 p-3 rounded-xl border border-amber-200 text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>A retificação altera apenas o valor total líquido e método comercial. Os produtos não podem ser alterados para preservar a OS.</span>
                </div>
                <div>
                  <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Forma de Pagamento Comercial</label>
                  <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none" value={metodoVendaEdicao} onChange={(e) => setMetodoVendaEdicao(e.target.value)}>
                    <option value="Pix">Pix</option>
                    <option value="Boleto">Boleto</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Crediário">Crediário (Carnê)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Valor Líquido Ajustado (R$)</label>
                  <input type="number" step="0.01" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-royalBlue" value={valorVendaEdicao} onChange={(e) => setValorVendaEdicao(e.target.value)} required />
                </div>
                <div className="flex space-x-3 pt-2">
                  <button type="button" onClick={() => setModalAberto(false)} className="w-1/2 bg-slate-100 py-2 rounded-lg text-xs sm:text-sm text-slate-600 hover:bg-slate-200">Cancelar</button>
                  <button type="submit" className="w-1/2 bg-royalBlue text-white py-2 rounded-lg text-xs sm:text-sm font-semibold border-b-2 border-gold flex items-center justify-center space-x-2"><Save className="w-4 h-4" /><span>Salvar Alterações</span></button>
                </div>
              </form>
            ) : (
              /* FORMULÁRIO DE DESPESAS ADAPTADO PARA INSERT / UPDATE */
              <form onSubmit={handleSalvarDespesa} className="p-4 sm:p-6 space-y-4">
                <div>
                  <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Descrição do Gasto</label>
                  <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-royalBlue" placeholder="Ex: Boleto mensal de lentes" value={descDespesa} onChange={(e) => setDescDespesa(e.target.value)} required />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Categoria</label>
                    <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-royalBlue" placeholder="Ex: Laboratório, Aluguel" value={categoriaDespesa} onChange={(e) => setCategoriaDespesa(e.target.value)} required />
                  </div>
                  <div>
                    <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Forma de Saída Prevista</label>
                    <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none" value={metodoDespesa} onChange={(e) => setMetodoDespesa(e.target.value)}>
                      <option value="Pix">Pix</option>
                      <option value="Boleto">Boleto</option>
                      <option value="Dinheiro">Dinheiro</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Valor da Despesa (R$)</label>
                  <input type="number" step="0.01" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-royalBlue" placeholder="0,00" value={valorDespesa} onChange={(e) => setValorDespesa(e.target.value)} required />
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="block text-xs font-bold text-slate-700">Esta despesa já foi paga?</span>
                    <span className="block text-[10px] text-slate-400">Se desmarcar, ela entrará como um lembrete/pendência no fluxo.</span>
                  </div>
                  <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-royalBlue focus:ring-royalBlue cursor-pointer" checked={despesaPaga} onChange={(e) => setDespesaPaga(e.target.checked)} />
                </div>

                <div className="flex space-x-3 pt-2">
                  <button type="button" onClick={() => setModalAberto(false)} className="w-1/2 bg-slate-100 py-2 rounded-lg text-xs sm:text-sm text-slate-600 hover:bg-slate-200">Cancelar</button>
                  <button type="submit" className="w-1/2 bg-rose-600 text-white py-2 rounded-lg text-xs sm:text-sm border-b-2 border-rose-800 hover:bg-rose-700 font-semibold">
                    {idEmEdicao ? 'Atualizar Despesa' : despesaPaga ? 'Confirmar Saída Paga' : 'Agendar Lembrete'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 🔔 MODAL DE ALERTA E CONFIRMAÇÃO INTEGRADO (SUBSTITUTO DOS ALERTS DO CHROME) */}
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
                  {alertaConfig.tipo === 'erro' ? <XCircle className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                </div>
                <div className="space-y-1 min-w-0">
                  <h3 className="text-base font-bold text-slate-800 tracking-tight">{alertaConfig.titulo}</h3>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">{alertaConfig.mensagem}</p>
                </div>
              </div>

              <div className="flex space-x-2 pt-2 justify-end">
                {alertaConfig.tipo === 'confirmacao' ? (
                  <>
                    <button type="button" onClick={() => setAlertaConfig(prev => ({ ...prev, aberto: false }))} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold">Não, manter</button>
                    <button type="button" onClick={alertaConfig.onConfirmar} className="bg-royalBlue text-white px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold border-b-2 border-gold shadow-sm">Sim, executar</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setAlertaConfig(prev => ({ ...prev, aberto: false }))} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold">Entendido</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COMPONENTE PRINCIPAL (TABELA / CARDS) */}
      {carregando ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 shadow-sm text-center">
          <Loader2 className="w-8 h-8 text-royalBlue animate-spin mb-2" />
          <p className="text-xs sm:text-sm text-slate-500">Buscando lançamentos...</p>
        </div>
      ) : lancamentosFiltrados.length === 0 ? (
        <div className="text-center p-8 bg-white rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-400 italic">
          Nenhum registro encontrado para o período selecionado.
        </div>
      ) : (
        <div className="space-y-4">
          
          {/* 📱 MODO MOBILE */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {lancamentosFiltrados.map((item) => (
              <div key={item.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between gap-3">
                <div>
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold ${
                      item.tipo === 'entrada' 
                        ? 'bg-emerald-50 text-emerald-700' 
                        : item.paga ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {item.tipo === 'entrada' ? 'VENDA' : item.paga ? 'PAGO' : 'PENDENTE'}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">{item.metodo}</span>
                  </div>
                  <p className={`text-xs text-slate-700 font-semibold whitespace-normal break-words leading-relaxed ${!item.paga ? 'text-slate-500 italic' : ''}`}>
                    {item.desc}
                  </p>
                </div>
                
                <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                  <span className={`text-sm font-bold ${item.tipo === 'entrada' ? 'text-emerald-600' : item.paga ? 'text-rose-600' : 'text-amber-600'}`}>
                    R$ {item.valor.toFixed(2)}
                  </span>
                  
                  <div className="flex items-center space-x-2">
                    {item.tipo === 'saida' && !item.paga && (
                      <button type="button" onClick={() => handleDarBaixaDespesa(item.id)} className="bg-amber-500 text-white text-[11px] font-bold px-2 py-1 rounded shadow-sm">Baixar</button>
                    )}
                    <button type="button" onClick={() => handleIniciarEdicao(item)} className="text-slate-400 active:text-royalBlue p-1.5 rounded-lg border border-slate-200"><Pencil className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => handleDeletarLancamento(item.id, item.tipo)} className="text-slate-400 active:text-rose-600 p-1.5 rounded-lg border border-slate-200"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 💻 MODO DESKTOP */}
          <div className="hidden md:block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-xs uppercase font-semibold border-b border-slate-200">
                  <th className="p-4 w-2/5">Histórico / Descrição</th>
                  <th className="p-4 w-32">Forma</th>
                  <th className="p-4 w-36">Status / Tipo</th>
                  <th className="p-4 text-right w-36">Valor Líquido</th>
                  <th className="p-4 text-center w-32">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {lancamentosFiltrados.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className={`p-4 font-medium text-slate-700 whitespace-normal break-words leading-relaxed ${!item.paga ? 'text-slate-500 italic' : ''}`}>
                      {item.desc}
                    </td>
                    <td className="p-4 text-slate-500">{item.metodo}</td>
                    <td className="p-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                        item.tipo === 'entrada' 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : item.paga ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {item.tipo === 'entrada' ? 'VENDA' : item.paga ? 'PAGO' : 'PENDENTE'}
                      </span>
                    </td>
                    <td className={`p-4 text-right font-bold ${
                      item.tipo === 'entrada' ? 'text-emerald-600' : item.paga ? 'text-rose-600' : 'text-amber-600'
                    }`}>
                      R$ {item.valor.toFixed(2)}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        {item.tipo === 'saida' && !item.paga && (
                          <button type="button" onClick={() => handleDarBaixaDespesa(item.id)} className="bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold px-2 py-1 rounded shadow-sm transition-colors">Baixar</button>
                        )}
                        <button type="button" onClick={() => handleIniciarEdicao(item)} className="text-slate-400 hover:text-royalBlue p-1.5 rounded-lg hover:bg-slate-100 transition-colors" title="Editar Lançamento"><Pencil className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => handleDeletarLancamento(item.id, item.tipo)} className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors" title="Remover"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}
    </div>
  )
}