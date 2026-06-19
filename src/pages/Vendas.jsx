import React, { useState } from 'react'
import { Plus, Trash2, Percent, Calendar } from 'lucide-react'
import { turso } from '../tursoClient'

export default function Vendas({ setModalAberto, carregarLancamentosDoBanco, clientes }) {
  const [buscaCliente, setBuscaCliente] = useState('')
  const [clienteSelecionado, setClienteSelecionado] = useState(null)
  const [focoBusca, setFocoBusca] = useState(false)
  const [metodoVenda, setMetodoVenda] = useState('Dinheiro')
  
  // Campo de Data com o dia atual de forma retroativa (Formato YYYY-MM-DD)
  const [dataVenda, setDataVenda] = useState(() => new Date().toISOString().split('T')[0])

  // Carrinho de Compras
  const [carrinho, setCarrinho] = useState([])
  const [produtoInput, setProdutoInput] = useState('') 
  const [valorInput, setValorInput] = useState('')

  // Descontos e Parcelamento
  const [desconto, setDesconto] = useState('') 
  const [valorEntrada, setValorEntrada] = useState('')
  const [numParcelas, setNumParcelas] = useState(1)
  const [diaVencimento, setDiaVencimento] = useState(10)

  // Autocomplete / Filtro de Clientes Estabilizado
  const clientesSugeridos = clientes.filter(c => {
    if (!buscaCliente) return false
    const termoBuscaLimpo = buscaCliente.toLowerCase().replace(/\D/g, '')
    const cpfClienteLimpo = c.cpf?.replace(/\D/g, '') || ''
    
    const nomeBate = c.nome?.toLowerCase().includes(buscaCliente.toLowerCase())
    const cpfBate = cpfClienteLimpo.includes(termoBuscaLimpo)
    
    return nomeBate || (termoBuscaLimpo !== '' && cpfBate)
  })

  // Carrinho
  const adicionarAoCarrinho = (e) => {
    e.preventDefault()
    if (!produtoInput || !valorInput || parseFloat(valorInput) <= 0) return

    const novoItem = {
      id: Date.now(),
      produto: produtoInput,
      valor: parseFloat(valorInput)
    }

    setCarrinho([...carrinho, novoItem])
    setProdutoInput('') 
    setValorInput('')   
  }

  const removerDoCarrinho = (id) => {
    setCarrinho(carrinho.filter(item => item.id !== id))
  }

  const subtotal = carrinho.reduce((sum, item) => sum + item.valor, 0)
  const valorDesconto = desconto ? parseFloat(desconto) : 0
  const totalComDesconto = Math.max(0, subtotal - valorDesconto)
  
  const entrada = valorEntrada ? parseFloat(valorEntrada) : 0
  const valorFinanciado = Math.max(0, totalComDesconto - entrada)
  const valorPorParcela = numParcelas > 0 ? valorFinanciado / numParcelas : 0

  const handleSalvarVenda = async (e) => {
    e.preventDefault()
    if (!clienteSelecionado || carrinho.length === 0) return

    const produtosResSummary = carrinho.map(item => item.produto).join(', ')
    const dataOcorrencia = new Date(`${dataVenda}T12:00:00`).toISOString()

    try {
      const resVenda = await turso.execute({
        sql: `INSERT INTO vendas 
              (cliente_id, produtos, subtotal, desconto, total_liquido, valor_entrada, metodo_venda, criado_em) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          clienteSelecionado.id, 
          produtosResSummary, 
          subtotal, 
          valorDesconto, 
          totalComDesconto, 
          entrada, 
          metodoVenda, 
          dataOcorrencia
        ]
      })

      const vendaId = resVenda.lastInsertRowid

      if (metodoVenda === 'Crediário' && valorFinanciado > 0) {
        const dataOrigem = new Date(`${dataVenda}T12:00:00`)
        for (let i = 1; i <= numParcelas; i++) {
          let dataVenc = new Date(dataOrigem.getFullYear(), dataOrigem.getMonth() + i, diaVencimento)
          
          await turso.execute({
            sql: "INSERT INTO parcelas_carne (venda_id, numero_parcela, valor_parcela, data_vencimento, status) VALUES (?, ?, ?, ?, ?)",
            args: [
              vendaId, 
              `${i}/${numParcelas}`, 
              valorPorParcela, 
              dataVenc.toISOString().split('T')[0], 
              'Pendente'
            ]
          })
        }
      }

      await carregarLancamentosDoBanco()
      
      setBuscaCliente('')
      setClienteSelecionado(null)
      setCarrinho([])
      setDesconto('')
      setValorEntrada('')
      setNumParcelas(1)
      setDataVenda(new Date().toISOString().split('T')[0]) 
      setModalAberto(false)
      
      alert("Venda registrada com sucesso no mês correto!")
    } catch (error) {
      console.error("Erro ao registrar venda no Turso:", error)
      alert("Houve um erro ao processar a venda no banco de dados.")
    }
  }

  return (
    <form onSubmit={handleSalvarVenda} className="p-4 sm:p-6 space-y-5 max-h-[85vh] overflow-y-auto w-full">
      
      {/* SELETOR DE DATA DA VENDA E CONDICIONAIS DE TOPO RESPONSIVOS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 relative">
        
        {/* Pesquisa / Seleção de Cliente */}
        <div className="relative col-span-1 sm:col-span-2 lg:col-span-1">
          {clienteSelecionado ? (
            <div>
              <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cliente Selecionado</label>
              <input 
                type="text" 
                className="w-full bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs sm:text-sm text-emerald-800 font-medium cursor-not-allowed h-10 flex items-center"
                value={clienteSelecionado.nome}
                disabled
              />
            </div>
          ) : (
            <div>
              <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Pesquisar Nome ou CPF do Cliente</label>
              <input 
                type="text" 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-royalBlue bg-white h-10" 
                placeholder="Digite para buscar..."
                value={buscaCliente}
                onChange={(e) => setBuscaCliente(e.target.value)}
                onFocus={() => setFocoBusca(true)}
                onBlur={() => setTimeout(() => setFocoBusca(false), 300)}
                required
              />
            </div>
          )}

          {/* Menu Dropdown Flutuante Otimizado */}
          {focoBusca && clientesSugeridos.length > 0 && (
            <div className="absolute left-0 right-0 bg-white border border-slate-200 mt-1 rounded-lg shadow-xl max-h-40 overflow-y-auto z-50 divide-y divide-slate-100">
              {clientesSugeridos.map(c => (
                <div 
                  key={c.id}
                  onMouseDown={() => {
                    setClienteSelecionado(c)
                    setFocoBusca(false)
                  }}
                  className="p-2.5 text-xs hover:bg-slate-50 cursor-pointer flex flex-col sm:flex-row sm:justify-between text-slate-700 gap-0.5"
                >
                  <span className="font-semibold truncate">{c.nome}</span>
                  <span className="text-slate-400 text-[10px] sm:text-xs shrink-0">CPF: {c.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CPF do Cliente ou Método de Pagamento */}
        <div className="col-span-1">
          {clienteSelecionado ? (
            <div>
              <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">CPF do Cliente</label>
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  className="w-full bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs sm:text-sm text-emerald-800 font-mono cursor-not-allowed h-10 flex items-center"
                  value={clienteSelecionado.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                  disabled
                />
                <button 
                  type="button" 
                  onClick={() => { setClienteSelecionado(null); setBuscaCliente(''); }} 
                  className="bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold px-3 rounded-lg hover:bg-rose-100 transition-colors shrink-0 h-10"
                >
                  Limpar
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Forma de Liquidação</label>
              <select 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold focus:outline-none focus:border-royalBlue text-slate-700 bg-white h-10 cursor-pointer"
                value={metodoVenda}
                onChange={(e) => setMetodoVenda(e.target.value)}
              >
                <option value="Dinheiro">Dinheiro</option>
                <option value="Pix">Pix</option>
                <option value="Cartão de Crédito">Cartão de Crédito</option>
                <option value="Crediário">Crediário / Carnê Próprio</option>
              </select>
            </div>
          )}
        </div>

        {/* CAMPO DE SELEÇÃO DE DATA DA OPERAÇÃO */}
        <div className="col-span-1">
          <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Data da Venda</label>
          <input 
            type="date" 
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 focus:outline-none focus:border-royalBlue bg-white shadow-sm h-10"
            value={dataVenda}
            onChange={(e) => setDataVenda(e.target.value)}
            required
          />
        </div>

      </div>

      {/* FORMA DE PAGAMENTO MOVIDA SE CLIENTE SELECIONADO */}
      {clienteSelecionado && (
        <div className="w-full">
          <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Forma de Liquidação</label>
          <select 
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold focus:outline-none focus:border-royalBlue text-slate-700 bg-white h-10 cursor-pointer"
            value={metodoVenda}
            onChange={(e) => setMetodoVenda(e.target.value)}
          >
            <option value="Dinheiro">Dinheiro</option>
            <option value="Pix">Pix</option>
            <option value="Cartão de Crédito">Cartão de Crédito</option>
            <option value="Crediário">Crediário / Carnê Próprio</option>
          </select>
        </div>
      )}

      {/* ADICIONAR PRODUTOS RESPONSIVO */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <span className="text-[11px] sm:text-xs font-bold text-royalBlue uppercase tracking-wider block">Incluir Itens no Carrinho</span>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Modelo / Produto (Livre)</label>
            <input 
              type="text"
              className="w-full border border-slate-300 bg-white rounded-lg px-3 h-9 text-xs focus:outline-none focus:border-royalBlue"
              placeholder="Ex: Armação Ray-Ban RB3025"
              value={produtoInput}
              onChange={(e) => setProdutoInput(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Preço (R$)</label>
            <input 
              type="number" 
              step="0.01"
              className="w-full border border-slate-300 bg-white rounded-lg px-3 h-9 text-xs font-medium focus:outline-none focus:border-royalBlue"
              placeholder="0,00"
              value={valorInput}
              onChange={(e) => setValorInput(e.target.value)}
            />
          </div>
          <button 
            type="button"
            onClick={adicionarAoCarrinho}
            className="bg-gold text-wood-dark font-bold text-xs h-9 px-3 rounded-lg flex items-center justify-center space-x-1 hover:bg-gold-dark active:scale-[0.98] transition-all sm:col-span-1 w-full"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Incluir</span>
          </button>
        </div>

        {/* VISUALIZAÇÃO DO CARRINHO */}
        <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-32 overflow-y-auto shadow-inner">
          {carrinho.length > 0 ? (
            carrinho.map((item) => (
              <div key={item.id} className="p-2.5 flex justify-between items-center text-xs hover:bg-slate-50/60">
                <span className="font-medium text-slate-700 break-all pr-2">{item.produto}</span>
                <div className="flex items-center space-x-3 shrink-0">
                  <span className="font-bold text-slate-800">R$ {item.valor.toFixed(2)}</span>
                  <button type="button" onClick={() => removerDoCarrinho(item.id)} className="text-rose-500 hover:text-rose-700 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-center py-5 text-slate-400 italic text-xs">Nenhum óculos ou item adicionado ainda.</p>
          )}
        </div>
      </div>

      {/* CONDICIONAL DE CREDIÁRIO */}
      {metodoVenda === 'Crediário' && (
        <div className="bg-amber-50/50 p-4 rounded-xl border border-gold/30 space-y-3">
          <div className="flex items-center space-x-2 text-wood-dark font-bold text-xs uppercase tracking-wider">
            <Calendar className="w-4 h-4 text-gold-dark shrink-0" />
            <span>Parametrizar Financiamento de Carnê</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Valor de Entrada (R$)</label>
              <input 
                type="number" 
                step="0.01"
                className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-royalBlue"
                placeholder="0,00"
                value={valorEntrada}
                onChange={(e) => setValorEntrada(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nº de Parcelas</label>
              <input 
                type="number" 
                min="1" 
                className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none text-center focus:border-royalBlue"
                value={numParcelas}
                onChange={(e) => setNumParcelas(parseInt(e.target.value) || 1)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Dia do Vencimento</label>
              <input 
                type="number" 
                min="1" 
                max="31"
                className="w-full border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none text-center focus:border-royalBlue"
                value={diaVencimento}
                onChange={(e) => setDiaVencimento(parseInt(e.target.value) || 10)}
              />
            </div>
          </div>
          {valorFinanciado > 0 && (
            <p className="text-[10px] sm:text-[11px] font-medium text-wood-dark/90 italic bg-white p-2.5 rounded-lg border border-slate-200 leading-relaxed">
              Do total líquido, <span className="font-bold text-emerald-600">R$ {entrada.toFixed(2)}</span> entram à vista no caixa. O saldo restante de <span className="font-bold text-royalBlue">R$ {valorFinanciado.toFixed(2)}</span> gerará <span className="font-bold">{numParcelas}x de R$ {valorPorParcela.toFixed(2)}</span> vencendo todo dia {diaVencimento}.
            </p>
          )}
        </div>
      )}

      {/* BLOCO TOTALIZADOR FINAL */}
      <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2.5 shadow-md">
        <div className="flex justify-between text-xs text-slate-400">
          <span>Subtotal bruto dos itens:</span>
          <span className="font-medium">R$ {subtotal.toFixed(2)}</span>
        </div>
        
        <div className="flex justify-between items-center text-xs border-b border-slate-800 pb-2.5">
          <span className="flex items-center space-x-1 text-slate-400">
            <Percent className="w-3.5 h-3.5 text-gold shrink-0" />
            <span>Aplicar Desconto Nominal (R$):</span>
          </span>
          <input 
            type="number"
            step="0.01"
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-right font-bold text-gold w-24 text-xs focus:outline-none focus:border-gold"
            placeholder="0,00"
            value={desconto}
            onChange={(e) => setDesconto(e.target.value)}
          />
        </div>

        <div className="flex justify-between items-center text-xs border-b border-slate-800 pb-2 pt-0.5">
          <span className="text-slate-400">Total Líquido da Venda:</span>
          <span className="font-bold text-slate-200">R$ {totalComDesconto.toFixed(2)}</span>
        </div>

        {entrada > 0 && (
          <div className="flex justify-between items-center text-xs border-b border-slate-800 pb-2 pt-0.5 text-emerald-400">
            <span>(-) Valor de Entrada Recebido:</span>
            <span className="font-bold">R$ {entrada.toFixed(2)}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pt-1 gap-1">
          <span className="text-xs sm:text-sm text-slate-300 font-medium">
            {metodoVenda === 'Crediário' ? 'Saldo Restante no Carnê:' : 'Total Líquido da Operação:'}
          </span>
          <span className="text-gold font-extrabold text-base sm:text-lg text-right">
            R$ {(metodoVenda === 'Crediário' ? valorFinanciado : totalComDesconto).toFixed(2)}
          </span>
        </div>
      </div>

      {/* BOTOES */}
      <div className="flex space-x-3 pt-2">
        <button type="button" onClick={() => setModalAberto(false)} className="w-1/3 bg-slate-100 py-2.5 rounded-lg font-medium text-xs sm:text-sm text-slate-600 hover:bg-slate-200 transition-colors">Cancelar</button>
        <button 
          type="submit" 
          disabled={!clienteSelecionado || carrinho.length === 0}
          className={`w-2/3 py-2.5 rounded-lg font-bold text-xs sm:text-sm border-b-2 border-gold text-white text-center transition-all shadow-md active:scale-[0.99]
            ${(!clienteSelecionado || carrinho.length === 0) ? 'bg-slate-300 border-slate-400 cursor-not-allowed opacity-50' : 'bg-royalBlue hover:bg-royalBlue-light'}`}
        >
          Confirmar e Finalizar Checkout
        </button>
      </div>

    </form>
  )
}