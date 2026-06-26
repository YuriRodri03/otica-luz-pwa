import React, { useState, useEffect } from 'react'
import { ArrowLeft, ShoppingBag, User, Loader2, Edit3, Trash2, Search, Calendar, ChevronDown, ChevronUp, AlertTriangle, XCircle, CheckCircle, Save, RotateCcw } from 'lucide-react'
import { turso } from '../tursoClient'

export default function Clientes({ clientes = [], setClientes }) {
  const [abaAtiva, setAbaAtiva] = useState('lista')
  const [clienteSelecionado, setClienteSelecionado] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [termoBusca, setTermoBusca] = useState('')
  const [idEdicao, setIdEdicao] = useState(null)

  // Histórico estruturado por Vendas agrupadas
  const [vendasAgrupadas, setVendasAgrupadas] = useState([])
  const [vendaAbertaId, setVendaAbertaId] = useState(null)

  // Estado para controlar a data de pagamento de cada parcela individualmente (Padrão: hoje)
  const [datasPagamento, setDatasPagamento] = useState({})

  // Sub-modal expandido para retificação completa da venda
  const [modalVendaEdicao, setModalVendaEdicao] = useState({ 
    aberto: false, 
    id: null,
    produtos: '',
    metodo: '',
    subtotal: '',
    desconto: '',
    entrada: '',
    totalVenda: '' 
  })

  // Estados do formulário de cadastro/edição de clientes
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [dataNascimento, setDataNascimento] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [cidade, setCidade] = useState('')
  const [observacoes, setObservacoes] = useState('')

  const [alertaConfig, setAlertaConfig] = useState({
    aberto: false,
    tipo: 'aviso',
    titulo: '',
    mensagem: '',
    onConfirmar: null
  })

  const carregarClientesDoBanco = async () => {
    setCarregando(true)
    try {
      const resultado = await turso.execute("SELECT * FROM clientes")
      const listaFormatada = resultado.rows.map(row => ({
        id: row.id,
        nome: row.nome,
        cpf: row.cpf,
        dataNascimento: row.data_nascimento,
        telefone: row.telefone,
        email: row.email,
        cidade: row.cidade,
        observacoes: row.observacoes
      }))
      setClientes(listaFormatada)
    } catch (error) {
      console.error("Erro ao sincronizar clientes:", error)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarClientesDoBanco()
  }, [])

  const carregarHistoricoVendasCliente = async (clienteId) => {
    try {
      const resVendas = await turso.execute({
        sql: "SELECT * FROM vendas WHERE cliente_id = ? ORDER BY id DESC",
        args: [clienteId]
      })

      const resParcelas = await turso.execute({
        sql: "SELECT * FROM parcelas_carne WHERE venda_id IN (SELECT id FROM vendas WHERE cliente_id = ?)",
        args: [clienteId]
      })

      const datasIniciais = {}
      const hojeStr = new Date().toISOString().split('T')[0]

      resParcelas.rows.forEach(p => {
        datasIniciais[p.id] = hojeStr
      })
      setDatasPagamento(prev => ({ ...datasIniciais, ...prev }))

      const vendasFormatadas = resVendas.rows.map(vendaRow => {
        const parcelasDaVenda = resParcelas.rows
          .filter(p => p.venda_id === vendaRow.id)
          .map(p => ({
            id: p.id,
            numero: p.numero_parcela,
            valor: p.valor_parcela,
            vencimento: p.data_vencimento ? p.data_vencimento.split('T')[0] : '',
            status: p.status || 'Pendente',
            pagoEm: p.pago_em ? p.pago_em.split('T')[0] : null
          }))

        return {
          id: vendaRow.id,
          data: vendaRow.criado_em ? vendaRow.criado_em.split('T')[0] : hojeStr,
          produtos: vendaRow.produtos,
          metodo: vendaRow.metodo_venda,
          subtotal: vendaRow.subtotal || 0,
          desconto: vendaRow.desconto || 0,
          entrada: vendaRow.valor_entrada || 0,
          totalVenda: vendaRow.total_liquido || 0, 
          parcelas: parcelasDaVenda
        }
      })

      setVendasAgrupadas(vendasFormatadas)
    } catch (error) {
      console.error("Erro ao montar histórico:", error)
    }
  }

  useEffect(() => {
    if (!clienteSelecionado) return
    carregarHistoricoVendasCliente(clienteSelecionado.id)
  }, [clienteSelecionado])

  const aplicarMascaraCPF = (valor) => {
    const limpo = valor.replace(/\D/g, '').slice(0, 11)
    setCpf(limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"))
  }

  const aplicarMascaraTelefone = (valor) => {
    const limpo = valor.replace(/\D/g, '').slice(0, 11)
    if (limpo.length <= 10) {
      setTelefone(limpo.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3"))
    } else {
      setTelefone(limpo.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3"))
    }
  }

  // ==========================================
  // SALVAR EDIÇÃO COMPLETA DA VENDA
  // ==========================================
  const handleSalvarEditarVenda = async (e) => {
    e.preventDefault()
    const { id, produtos, metodo, subtotal, desconto, entrada, totalVenda } = modalVendaEdicao

    try {
      await turso.execute({
        sql: `UPDATE vendas SET 
                produtos = ?, 
                metodo_venda = ?, 
                subtotal = ?, 
                desconto = ?, 
                valor_entrada = ?, 
                total_liquido = ? 
              WHERE id = ?`,
        args: [
          produtos.trim(), 
          metodo, 
          parseFloat(subtotal) || 0, 
          parseFloat(desconto) || 0, 
          parseFloat(entrada) || 0, 
          parseFloat(totalVenda) || 0, 
          id
        ]
      })
      await carregarHistoricoVendasCliente(clienteSelecionado.id)
      setModalVendaEdicao({ aberto: false, id: null, produtos: '', metodo: '', subtotal: '', desconto: '', entrada: '', totalVenda: '' })
      setAlertaConfig({ aberto: true, tipo: 'sucesso', titulo: 'Sucesso', mensagem: 'Dados da venda retificados com sucesso!', onConfirmar: null })
    } catch (error) {
      console.error("Erro ao retificar venda:", error)
    }
  }

  const handleRemoverVenda = (idVenda) => {
    setAlertaConfig({
      aberto: true,
      tipo: 'confirmacao',
      titulo: 'Estornar Venda',
      mensagem: 'Tem certeza que deseja estornar esta venda? Todas as parcelas e históricos associados serão destruídos.',
      onConfirmar: async () => {
        try {
          await turso.execute({ sql: "DELETE FROM parcelas_carne WHERE venda_id = ?", args: [idVenda] })
          await turso.execute({ sql: "DELETE FROM vendas WHERE id = ?", args: [idVenda] })
          await carregarHistoricoVendasCliente(clienteSelecionado.id)
          setAlertaConfig({ aberto: true, tipo: 'sucesso', titulo: 'Estorno Concluído', mensagem: 'A venda foi removida do sistema.', onConfirmar: null })
        } catch (error) {
          console.error(error)
        }
      }
    })
  }

  const baixarParcelaDoCliente = (parcela) => {
    const dataEscolhida = datasPagamento[parcela.id] || new Date().toISOString().split('T')[0]
    
    setAlertaConfig({
      aberto: true,
      tipo: 'confirmacao',
      titulo: 'Liquidar Crediário',
      mensagem: `Confirmar o recebimento da parcela número ${parcela.numero} efetuado no dia ${formatarDataBR(dataEscolhida)}?`,
      onConfirmar: async () => {
        try {
          await turso.execute({ 
            sql: "UPDATE parcelas_carne SET status = 'Pago', pago_em = ? WHERE id = ?", 
            args: [dataEscolhida, parcela.id] 
          })
          await carregarHistoricoVendasCliente(clienteSelecionado.id)
          setAlertaConfig({ aberto: true, tipo: 'sucesso', titulo: 'Parcela Paga', mensagem: 'Recebimento homologado com sucesso.', onConfirmar: null })
        } catch (error) {
          console.error(error)
        }
      }
    })
  }

  // ==========================================
  // OPERAÇÃO DE ESTORNO DE BAIXA DA PARCELA
  // ==========================================
  const estornarBaixaParcela = (parcela) => {
    setAlertaConfig({
      aberto: true,
      tipo: 'confirmacao',
      titulo: 'Estornar Pagamento',
      mensagem: `Deseja reverter a baixa da parcela número ${parcela.numero}? O status retornará para 'Pendente'.`,
      onConfirmar: async () => {
        try {
          await turso.execute({
            sql: "UPDATE parcelas_carne SET status = 'Pendente', pago_em = NULL WHERE id = ?",
            args: [parcela.id]
          })
          await carregarHistoricoVendasCliente(clienteSelecionado.id)
          setAlertaConfig({ aberto: true, tipo: 'sucesso', titulo: 'Estorno Homologado', mensagem: 'A parcela retornou para o estado pendente.', onConfirmar: null })
        } catch (error) {
          console.error("Erro ao estornar parcela:", error)
        }
      }
    })
  }

  const handleSalvar = async (e) => {
    e.preventDefault()
    if (!nome || !cpf || !dataNascimento) return
    
    const cpfPuro = cpf.replace(/[^0-9]/g, '')
    const telefonePuro = telefone.replace(/[^0-9]/g, '')

    if (cpfPuro.length !== 11) {
      setAlertaConfig({ aberto: true, tipo: 'erro', titulo: 'Documento Inválido', mensagem: 'O CPF digitado precisa conter exatamente 11 dígitos.', onConfirmar: null })
      return
    }

    try {
      if (idEdicao) {
        const checarCpf = await turso.execute({
          sql: "SELECT id FROM clientes WHERE cpf = ? AND id <> ?",
          args: [cpfPuro, idEdicao]
        })

        if (checarCpf.rows.length > 0) {
          setAlertaConfig({ aberto: true, tipo: 'aviso', titulo: 'Duplicidade de CPF', mensagem: 'Este CPF já pertence a outro cliente cadastrado.', onConfirmar: null })
          return
        }

        await turso.execute({
          sql: `UPDATE clientes SET nome = ?, cpf = ?, data_nascimento = ?, telefone = ?, email = ?, cidade = ?, observacoes = ? WHERE id = ?`,
          args: [nome.trim(), cpfPuro, dataNascimento, telefonePuro, email.trim(), cidade.trim(), observacoes.trim(), idEdicao]
        })
      } else {
        const checarCpfNovo = await turso.execute({ sql: "SELECT id FROM clientes WHERE cpf = ?", args: [cpfPuro] })

        if (checarCpfNovo.rows.length > 0) {
          setAlertaConfig({ aberto: true, tipo: 'aviso', titulo: 'Cadastro Bloqueado', mensagem: 'Este CPF já está registrado na base de dados.', onConfirmar: null })
          return
        }

        await turso.execute({
          sql: `INSERT INTO clientes (nome, cpf, data_nascimento, telefone, email, cidade, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [nome.trim(), cpfPuro, dataNascimento, telefonePuro, email.trim(), cidade.trim(), observacoes.trim()]
        })
      }
      await carregarClientesDoBanco()
      limparFormulario()
      setAbaAtiva('lista')
    } catch (error) {
      console.error(error)
    }
  }

  const handleExcluir = (id, nomeCliente) => {
    setAlertaConfig({
      aberto: true,
      tipo: 'confirmacao',
      titulo: 'Remover Cliente',
      mensagem: `Deseja deletar permanentemente a ficha cadastral de "${nomeCliente}"?`,
      onConfirmar: async () => {
        try {
          await turso.execute({ sql: "DELETE FROM clientes WHERE id = ?", args: [id] })
          await carregarClientesDoBanco()
          setAlertaConfig({ aberto: true, tipo: 'sucesso', titulo: 'Ficha Excluída', mensagem: 'Cliente removido da carteira activa.', onConfirmar: null })
        } catch (error) {
          console.error(error)
        }
      }
    })
  }

  const iniciarEdicao = (cliente) => {
    setIdEdicao(cliente.id)
    setNome(cliente.nome)
    setCpf(cliente.cpf)
    setDataNascimento(cliente.dataNascimento)
    setTelefone(cliente.telefone || '')
    setEmail(cliente.email || '')
    setCidade(cliente.cidade || '')
    setObservacoes(cliente.observacoes || '')
    setAbaAtiva('cadastro')
  }

  const limparFormulario = () => {
    setIdEdicao(null)
    setNome(''); setCpf(''); setDataNascimento(''); setTelefone(''); setEmail(''); setCidade(''); setObservacoes('')
  }

  const formatarDataBR = (dataString) => {
    if (!dataString) return 'Não informada'
    const partes = dataString.split('-')
    return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : dataString
  }

  const formatarCPF = (cpfString) => {
    const limpo = cpfString?.replace(/\D/g, '') || ''
    return limpo.length === 11 ? limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : cpfString
  }

  const formatarTelefone = (telString) => {
    const limpo = telString?.replace(/\D/g, '') || ''
    if (limpo.length === 11) return limpo.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")
    if (limpo.length === 10) return limpo.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3")
    return telString
  }

  const clientesFiltradosEOrdenados = (clientes || [])
    .filter(c => {
      const t = termoBusca.toLowerCase().trim()
      if (!t) return true
      const nomeCliente = String(c.nome || '').toLowerCase()
      const nomeMatch = nomeCliente.includes(t)
      const cpfCliente = String(c.cpf || '')
      const cpfLimpoBusca = t.replace(/\D/g, '')
      const cpfMatch = cpfLimpoBusca ? cpfCliente.includes(cpfLimpoBusca) : false
      return nomeMatch || cpfMatch
    })
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')))

  return (
    <div className="space-y-6 px-1 sm:px-4 max-w-full overflow-hidden">
      
      {/* CABEÇALHO */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-royalBlue">Módulo de Clientes</h2>
          <p className="text-xs sm:text-sm text-slate-500">Gerencie a carteira, históricos e novos cadastros da Ótica Luz.</p>
        </div>
        {abaAtiva === 'lista' && !clienteSelecionado && (
          <button 
            onClick={() => { limparFormulario(); setAbaAtiva('cadastro'); setClienteSelecionado(null); }}
            className="w-full sm:w-auto bg-royalBlue hover:bg-royalBlue-light text-white font-medium px-5 py-2.5 rounded-lg border-b-2 border-gold shadow-md text-xs sm:text-sm transition-all"
          >
            + Novo Cliente
          </button>
        )}
      </header>

      {/* SELEÇÃO DE ABAS */}
      {!clienteSelecionado && (
        <div className="flex space-x-2 border-b border-slate-200 mb-6 overflow-x-auto whitespace-nowrap scrollbar-none">
          <button onClick={() => setAbaAtiva('lista')} className={`py-2 px-3 sm:px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all ${abaAtiva === 'lista' ? 'border-gold text-royalBlue font-bold' : 'border-transparent text-slate-400'}`}>
            Carteira de Clientes ({clientesFiltradosEOrdenados.length})
          </button>
          <button onClick={() => setAbaAtiva('cadastro')} className={`py-2 px-3 sm:px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all ${abaAtiva === 'cadastro' ? 'border-gold text-royalBlue font-bold' : 'border-transparent text-slate-400'}`}>
            {idEdicao ? '⚡ Editando Cadastro' : 'Ficha de Novo Cadastro'}
          </button>
        </div>
      )}

      {/* LOADING */}
      {carregando && abaAtiva === 'lista' && !clienteSelecionado && (
        <div className="flex flex-col items-center justify-center p-8 bg-white rounded-xl border border-slate-200 shadow-sm text-center">
          <Loader2 className="w-8 h-8 text-royalBlue animate-spin mb-2" />
          <p className="text-xs sm:text-sm text-slate-500">Sincronizando com a base de dados...</p>
        </div>
      )}

      {/* DETALHES DO CLIENTE SELECIONADO */}
      {clienteSelecionado && (
        <div className="space-y-6">
          <button onClick={() => setClienteSelecionado(null)} className="flex items-center space-x-2 text-xs sm:text-sm font-semibold text-royalBlue hover:text-royalBlue-light transition-colors bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm w-full sm:w-auto justify-center">
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar para a Carteira</span>
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 h-fit">
              <div className="flex items-center space-x-3 mb-4 pb-4 border-b border-slate-100">
                <div className="p-2.5 bg-royalBlue/10 text-royalBlue rounded-xl shrink-0"><User className="w-5 h-5" /></div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base truncate">{clienteSelecionado.nome}</h3>
                  <p className="text-[11px] text-slate-400">ID: #{clienteSelecionado.id}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 text-xs sm:text-sm">
                <div><span className="text-[10px] text-slate-400 block uppercase font-semibold">CPF</span><span className="text-slate-700 font-mono font-medium">{formatarCPF(clienteSelecionado.cpf)}</span></div>
                <div><span className="text-[10px] text-slate-400 block uppercase font-semibold">Nascimento</span><span className="text-slate-700 font-medium">{formatarDataBR(clienteSelecionado.dataNascimento)}</span></div>
                <div><span className="text-[10px] text-slate-400 block uppercase font-semibold">Telefone</span><span className="text-slate-700 font-medium">{formatarTelefone(clienteSelecionado.telefone) || 'Não informado'}</span></div>
                <div><span className="text-[10px] text-slate-400 block uppercase font-semibold">Cidade</span><span className="text-slate-700 font-medium">{clienteSelecionado.cidade || 'Não informada'}</span></div>
              </div>
            </div>

            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <div className="flex items-center space-x-2 mb-6 border-b border-slate-100 pb-3">
                <ShoppingBag className="w-5 h-5 text-gold shrink-0" />
                <h3 className="font-bold text-royalBlue text-base sm:text-lg">Histórico de Compras Realizadas</h3>
              </div>

              {vendasAgrupadas.length > 0 ? (
                <div className="space-y-4">
                  {vendasAgrupadas.map(venda => (
                    <div key={venda.id} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                      <div className="p-4 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 select-none">
                        <div onClick={() => setVendaAbertaId(vendaAbertaId === venda.id ? null : venda.id)} className="space-y-1.5 cursor-pointer w-full sm:flex-1 min-w-0">
                          <p className="font-bold text-slate-700 text-xs sm:text-sm break-words">{venda.produtos}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400 font-medium">
                            <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" /> {formatarDataBR(venda.data)}</span>
                            <span>Tipo: <strong className="text-royalBlue">{venda.metodo}</strong></span>
                            {venda.entrada > 0 && <span className="text-emerald-600 font-bold">Entrad.: R$ {venda.entrada.toFixed(2)}</span>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 shrink-0">
                          <p className="font-extrabold text-royalBlue text-sm sm:text-base">R$ {venda.totalVenda.toFixed(2)}</p>
                          <div className="flex items-center space-x-1.5">
                            <button onClick={() => setModalVendaEdicao({ 
                              aberto: true, 
                              id: venda.id,
                              produtos: venda.produtos,
                              metodo: venda.metodo,
                              subtotal: venda.subtotal.toString(),
                              desconto: venda.desconto.toString(),
                              entrada: venda.entrada.toString(),
                              totalVenda: venda.totalVenda.toString()
                            })} className="p-1.5 bg-white text-slate-500 hover:bg-royalBlue hover:text-white rounded-md border border-slate-200 transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleRemoverVenda(venda.id)} className="p-1.5 bg-white text-rose-500 hover:bg-rose-600 hover:text-white rounded-md border border-slate-200 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                            <div onClick={() => setVendaAbertaId(vendaAbertaId === venda.id ? null : venda.id)} className="cursor-pointer px-2 py-1 hover:bg-slate-200/50 rounded-md">
                              {vendaAbertaId === venda.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            </div>
                          </div>
                        </div>
                      </div>

                      {vendaAbertaId === venda.id && (
                        <div className="p-3 sm:p-4 border-t border-slate-100 bg-white space-y-3">
                          <h4 className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Detalhamento do Recebimento / Carnê</h4>
                          {venda.parcelas.length > 0 ? (
                            <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                              {venda.parcelas.map(parc => (
                                <div key={parc.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-slate-50/50">
                                  <div className="flex justify-between sm:flex-col sm:space-y-0.5 w-full sm:w-auto">
                                    <p className="font-bold text-slate-700">Parcela {parc.numero}</p>
                                    <p className="text-slate-400 font-medium">Venc.: {formatarDataBR(parc.vencimento)}</p>
                                    {parc.status === 'Pago' && parc.pagoEm && (
                                      <p className="text-emerald-600 font-medium text-[11px]">Recebido em: {formatarDataBR(parc.pagoEm)}</p>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-dashed border-slate-100">
                                    <p className="font-bold text-slate-800">R$ {parseFloat(parc.valor).toFixed(2)}</p>
                                    <div className="flex items-center space-x-2">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${parc.status === 'Pago' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{parc.status}</span>
                                      
                                      {parc.status !== 'Pago' ? (
                                        <div className="flex items-center space-x-2 bg-slate-50 p-1 rounded-md border border-slate-200">
                                          <input 
                                            type="date" 
                                            className="border-0 bg-transparent text-[11px] font-medium text-slate-700 focus:outline-none p-0.5"
                                            value={datasPagamento[parc.id] || ''} 
                                            onChange={(e) => setDatasPagamento(prev => ({ ...prev, [parc.id]: e.target.value }))}
                                          />
                                          <button 
                                            onClick={() => baixarParcelaDoCliente(parc)} 
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-2.5 py-1 rounded transition-colors shadow-sm"
                                          >
                                            Liquidar
                                          </button>
                                        </div>
                                      ) : (
                                        <button 
                                          onClick={() => estornarBaixaParcela(parc)}
                                          className="flex items-center space-x-1 text-[10px] font-semibold text-rose-600 hover:text-white hover:bg-rose-600 bg-rose-50 border border-rose-200 px-2 py-1 rounded transition-all shadow-sm"
                                          title="Estornar baixa da parcela"
                                        >
                                          <RotateCcw className="w-3 h-3" />
                                          <span>Estornar</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-emerald-600 font-semibold bg-emerald-50 p-2.5 rounded border border-emerald-100 block w-full">✓ Venda à vista liquidada integralmente.</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400 text-xs sm:text-sm border-2 border-dashed border-slate-100 rounded-xl">Nenhum faturamento estruturado associado a este cliente.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LISTAGEM DE CARTEIRA */}
      {abaAtiva === 'lista' && !clienteSelecionado && !carregando && (
        <div className="space-y-4">
          <div className="relative max-w-md w-full">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><Search className="w-4 h-4 text-slate-400" /></span>
            <input type="text" placeholder="Pesquisar cliente por nome ou CPF..." className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:border-royalBlue bg-white shadow-sm" value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} />
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200 w-full">
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] sm:text-xs uppercase font-semibold border-b border-slate-200">
                    <th className="p-3 sm:p-4">Nome</th>
                    <th className="p-3 sm:p-4">CPF</th>
                    <th className="p-3 sm:p-4">Nascimento</th>
                    <th className="p-3 sm:p-4">Telefone</th>
                    <th className="p-3 sm:p-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {clientesFiltradosEOrdenados.length > 0 ? (
                    clientesFiltradosEOrdenados.map((cliente) => (
                      <tr key={cliente.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 sm:p-4 font-medium text-slate-700">{cliente.nome}</td>
                        <td className="p-3 sm:p-4 text-slate-500 font-mono">{formatarCPF(cliente.cpf)}</td>
                        <td className="p-3 sm:p-4 text-slate-500">{formatarDataBR(cliente.dataNascimento)}</td>
                        <td className="p-3 sm:p-4 text-slate-500">{formatarTelefone(cliente.telefone) || 'Não informado'}</td>
                        <td className="p-3 sm:p-4 flex items-center justify-center space-x-1.5">
                          <button onClick={() => setClienteSelecionado(cliente)} className="bg-gold text-wood-dark hover:bg-gold-dark font-bold text-[11px] px-2.5 py-1.5 rounded transition-colors shadow-sm">Histórico</button>
                          <button onClick={() => { iniciarEdicao(cliente); }} className="p-1.5 bg-slate-100 text-slate-600 hover:bg-royalBlue hover:text-white rounded-lg transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleExcluir(cliente.id, cliente.nome)} className="p-1.5 bg-slate-100 text-rose-600 hover:bg-rose-600 hover:text-white rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="5" className="text-center p-8 text-slate-400">Nenhum cliente correspondente encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* FORMULÁRIO DE CADASTRO */}
      {abaAtiva === 'cadastro' && !clienteSelecionado && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
          <div className="bg-royalBlue p-4 text-white font-bold border-b-4 border-gold text-xs sm:text-sm">
            {idEdicao ? `Atualizar Cadastro: ${nome}` : 'Preencha os Dados Cadastrais do Cliente'}
          </div>
          <form onSubmit={handleSalvar} className="p-4 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Nome Completo</label>
                <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-royalBlue" value={nome} onChange={(e) => setNome(e.target.value)} required />
              </div>
              <div>
                <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">CPF (11 números)</label>
                <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-royalBlue font-mono" placeholder="000.000.000-00" value={cpf} onChange={(e) => aplicarMascaraCPF(e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Data de Nascimento</label>
                <input type="date" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-700 focus:outline-none" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} required />
              </div>
              <div>
                <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Telefone (DDD + Número)</label>
                <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none font-mono" placeholder="(88) 99999-0000" value={telefone} onChange={(e) => aplicarMascaraTelefone(e.target.value)} />
              </div>
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">E-mail</label>
                <input type="email" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none" placeholder="cliente@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Cidade</label>
              <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none" value={cidade} onChange={(e) => setCidade(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Observações Opcionais</label>
              <textarea rows="3" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none resize-none" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </div>
            <div className="flex justify-end space-x-3 pt-2">
              <button type="button" onClick={() => { limparFormulario(); setAbaAtiva('lista'); }} className="bg-slate-100 px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-200">Cancelar</button>
              <button type="submit" className="bg-royalBlue text-white font-medium px-5 sm:px-6 py-2 rounded-lg border-b-2 border-gold shadow-md text-xs sm:text-sm">{idEdicao ? 'Salvar Alterações' : 'Concluir Cadastro'}</button>
            </div>
          </form>
        </div>
      )}

      {/* SUB-MODAL EXCLUSIVO PARA RETIFICAÇÃO COMPLETA DA VENDA */}
      {modalVendaEdicao.aberto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-3">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-gold">
            <div className="bg-royalBlue p-4 text-white font-bold flex justify-between items-center">
              <span className="text-xs sm:text-sm">Editar Detalhes Faturamento da Venda</span>
              <button onClick={() => setModalVendaEdicao({ aberto: false, id: null, produtos: '', metodo: '', subtotal: '', desconto: '', entrada: '', totalVenda: '' })} className="text-slate-300 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSalvarEditarVenda} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Produtos Adquiridos</label>
                <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-royalBlue" value={modalVendaEdicao.produtos} onChange={(e) => setModalVendaEdicao(prev => ({ ...prev, produtos: e.target.value }))} required />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Método de Venda</label>
                  <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-royalBlue bg-white" value={modalVendaEdicao.metodo} onChange={(e) => setModalVendaEdicao(prev => ({ ...prev, metodo: e.target.value }))} required>
                    <option value="PIX">PIX</option>
                    <option value="DH">Dinheiro (DH)</option>
                    <option value="Cartão">Cartão</option>
                    <option value="Crediário">Crediário Próprio</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Subtotal (R$)</label>
                  <input type="number" step="0.01" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-royalBlue" value={modalVendaEdicao.subtotal} onChange={(e) => setModalVendaEdicao(prev => ({ ...prev, subtotal: e.target.value }))} required />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Desconto (R$)</label>
                  <input type="number" step="0.01" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-royalBlue" value={modalVendaEdicao.desconto} onChange={(e) => setModalVendaEdicao(prev => ({ ...prev, desconto: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Entrada (R$)</label>
                  <input type="number" step="0.01" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-royalBlue" value={modalVendaEdicao.entrada} onChange={(e) => setModalVendaEdicao(prev => ({ ...prev, entrada: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Total Líquido (R$)</label>
                  <input type="number" step="0.01" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-royalBlue font-bold text-royalBlue" value={modalVendaEdicao.totalVenda} onChange={(e) => setModalVendaEdicao(prev => ({ ...prev, totalVenda: e.target.value }))} required />
                </div>
              </div>

              <div className="flex space-x-2 justify-end pt-2">
                <button type="button" onClick={() => setModalVendaEdicao({ aberto: false, id: null, produtos: '', metodo: '', subtotal: '', desconto: '', entrada: '', totalVenda: '' })} className="bg-slate-100 px-4 py-2 rounded-lg text-xs font-semibold text-slate-700">Cancelar</button>
                <button type="submit" className="bg-royalBlue text-white px-4 py-2 rounded-lg text-xs font-semibold border-b-2 border-gold flex items-center space-x-1"><Save className="w-3.5 h-3.5" /><span>Salvar</span></button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                    <button type="button" onClick={() => setAlertaConfig(prev => ({ ...prev, aberto: false }))} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold">Não, voltar</button>
                    <button type="button" onClick={() => { alertaConfig.onConfirmar(); setAlertaConfig(prev => ({ ...prev, aberto: false })); }} className="bg-royalBlue text-white px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold border-b-2 border-gold shadow-sm">Sim, executar</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setAlertaConfig(prev => ({ ...prev, aberto: false }))} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold">Entendido</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}