import React, { useState, useEffect } from 'react'
import { ArrowLeft, ShoppingBag, User, Loader2, Edit3, Trash2, Search, Calendar, ChevronDown, ChevronUp } from 'lucide-react'
import { turso } from '../tursoClient'

export default function Clientes({ clientes, setClientes }) {
  const [abaAtiva, setAbaAtiva] = useState('lista')
  const [clienteSelecionado, setClienteSelecionado] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [termoBusca, setTermoBusca] = useState('')
  const [idEdicao, setIdEdicao] = useState(null)

  // Histórico estruturado por Vendas agrupadas
  const [vendasAgrupadas, setVendasAgrupadas] = useState([])
  const [vendaAbertaId, setVendaAbertaId] = useState(null)

  // Estados do formulário de cadastro/edição de clientes
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [dataNascimento, setDataNascimento] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [cidade, setCidade] = useState('')
  const [observacoes, setObservacoes] = useState('')

  // ==========================================
  // CARREGAR DADOS DO BANCO TURSO
  // ==========================================
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
      console.error("Erro ao sincronizar clientes com o Turso:", error)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarClientesDoBanco()
  }, [])

  // ==========================================
  // CONSTRUÇÃO DO HISTÓRICO UTILIZANDO AS TABELAS REAIS
  // ==========================================
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

      const vendasFormatadas = resVendas.rows.map(vendaRow => {
        const parcelasDaVenda = resParcelas.rows
          .filter(p => p.venda_id === vendaRow.id)
          .map(p => ({
            id: p.id,
            numero: p.numero_parcela,
            valor: p.valor_parcela,
            vencimento: p.data_vencimento ? p.data_vencimento.split('T')[0] : '',
            status: p.status || 'Pendente'
          }))

        return {
          id: vendaRow.id,
          data: vendaRow.criado_em ? vendaRow.criado_em.split('T')[0] : new Date().toISOString().split('T')[0],
          produtos: vendaRow.produtos,
          metodo: vendaRow.metodo_venda === 'Crediário' ? 'Crediário Próprio' : vendaRow.metodo_venda,
          subtotal: vendaRow.subtotal,
          desconto: vendaRow.desconto,
          entrada: vendaRow.valor_entrada,
          totalVenda: vendaRow.total_liquido, 
          parcelas: parcelasDaVenda
        }
      })

      setVendasAgrupadas(vendasFormatadas)
    } catch (error) {
      console.error("Erro ao montar histórico por tabelas relacionais:", error)
    }
  }

  useEffect(() => {
    if (!clienteSelecionado) return
    carregarHistoricoVendasCliente(clienteSelecionado.id)
  }, [clienteSelecionado])

  // ==========================================
  // OPERAÇÕES: EDITAR, REMOVER E LIQUIDAR PARCELA
  // ==========================================
  const handleEditarVenda = async (venda) => {
    const novoValor = window.prompt(`Digite o novo valor total líquido para esta venda (Valor Atual: R$ ${venda.totalVenda.toFixed(2)}):`, venda.totalVenda)
    if (novoValor === null || isNaN(parseFloat(novoValor))) return

    try {
      await turso.execute({
        sql: "UPDATE vendas SET total_liquido = ? WHERE id = ?",
        args: [parseFloat(novoValor), venda.id]
      })

      await carregarHistoricoVendasCliente(clienteSelecionado.id)
      alert("Valor da venda retificado com sucesso!")
    } catch (error) {
      console.error("Erro ao editar venda:", error)
    }
  }

  const handleRemoverVenda = async (idVenda) => {
    const confirmou = window.confirm("Tem certeza que deseja estornar esta venda?\nTodas as parcelas e registros vinculados serão removidos.")
    if (!confirmou) return

    try {
      await turso.execute({ sql: "DELETE FROM parcelas_carne WHERE venda_id = ?", args: [idVenda] })
      await turso.execute({ sql: "DELETE FROM vendas WHERE id = ?", args: [idVenda] })

      await carregarHistoricoVendasCliente(clienteSelecionado.id)
      alert("Venda estornada com sucesso!")
    } catch (error) {
      console.error("Erro ao deletar faturamento de venda:", error)
    }
  }

  const baixarParcelaDoCliente = async (parcela, produtosVenda) => {
    const confirmou = window.confirm(`Confirmar recebimento da parcela ${parcela.numero}?`)
    if (!confirmou) return

    try {
      await turso.execute({
        sql: "UPDATE parcelas_carne SET status = 'Pago' WHERE id = ?",
        args: [parcela.id]
      })
      alert("Parcela baixada com sucesso no crediário!")
      await carregarHistoricoVendasCliente(clienteSelecionado.id)
    } catch (error) {
      console.error("Erro ao liquidar parcela:", error)
    }
  }

  // ==========================================
  // OPERAÇÕES DO FORMULÁRIO DE CLIENTES
  // ==========================================
  const handleSalvar = async (e) => {
    e.preventDefault()
    if (!nome || !cpf || !dataNascimento) return
    
    const cpfPuro = cpf.replace(/[^0-9]/g, '')
    const telefonePuro = telefone.replace(/[^0-9]/g, '')

    try {
      if (idEdicao) {
        const checarCpf = await turso.execute({
          sql: "SELECT id FROM clientes WHERE cpf = ? AND id <> ?",
          args: [cpfPuro, idEdicao]
        })

        if (checarCpf.rows.length > 0) {
          alert("Atenção: Este CPF já pertence a outro cliente cadastrado!")
          return
        }

        await turso.execute({
          sql: `UPDATE clientes SET nome = ?, cpf = ?, data_nascimento = ?, telefone = ?, email = ?, cidade = ?, observacoes = ? WHERE id = ?`,
          args: [nome, cpfPuro, dataNascimento, telefonePuro, email, cidade, observacoes, idEdicao]
        })
      } else {
        const checarCpfNovo = await turso.execute({
          sql: "SELECT id FROM clientes WHERE cpf = ?",
          args: [cpfPuro]
        })

        if (checarCpfNovo.rows.length > 0) {
          alert("Não foi possível cadastrar. Este CPF já está registrado no sistema!")
          return
        }

        await turso.execute({
          sql: `INSERT INTO clientes (nome, cpf, data_nascimento, telefone, email, cidade, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [nome, cpfPuro, dataNascimento, telefonePuro, email, cidade, observacoes]
        })
      }
      await carregarClientesDoBanco()
      limparFormulario()
      setAbaAtiva('lista')
    } catch (error) {
      console.error("Erro ao salvar cadastro do cliente:", error)
      alert("Houve um erro operacional ao tentar salvar os dados no Turso.")
    }
  }

  const handleExcluir = async (id, nomeCliente) => {
    if (!window.confirm(`Excluir permanentemente o cadastro de "${nomeCliente}"?`)) return
    try {
      await turso.execute({ sql: "DELETE FROM clientes WHERE id = ?", args: [id] })
      await carregarClientesDoBanco()
    } catch (error) {
      console.error(error)
    }
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

  const clientesFiltradosEOrdenados = clientes
    .filter(c => {
      const t = termoBusca.toLowerCase()
      return c.nome?.toLowerCase().includes(t) || c.cpf?.includes(t.replace(/\D/g, ''))
    })
    .sort((a, b) => a.nome.localeCompare(b.nome))

  return (
    <div className="space-y-6 px-1 sm:px-4 max-w-full overflow-hidden">
      
      {/* CABEÇALHO RESPONSIVO */}
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
          <button onClick={() => setAbaAtiva('lista')} className={`py-2 px-3 sm:px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all ${abaAtiva === 'lista' ? 'border-gold text-royalBlue font-bold' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            Carteira de Clientes ({clientesFiltradosEOrdenados.length})
          </button>
          <button onClick={() => setAbaAtiva('cadastro')} className={`py-2 px-3 sm:px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all ${abaAtiva === 'cadastro' ? 'border-gold text-royalBlue font-bold' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
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
          <button onClick={() => setClienteSelecionado(null)} className="flex items-center space-x-2 text-xs sm:text-sm font-semibold text-royalBlue hover:text-royalBlue-light transition-colors bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm w-full sm:w-auto justify-center sm:justify-start">
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar para a Carteira</span>
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Card Lateral Cadastral */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 sm:p-6 h-fit">
              <div className="flex items-center space-x-3 mb-4 pb-4 border-b border-slate-100">
                <div className="p-2.5 bg-royalBlue/10 text-royalBlue rounded-lg shrink-0"><User className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base truncate">{clienteSelecionado.nome}</h3>
                  <p className="text-[11px] text-slate-400">ID: #{clienteSelecionado.id}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 text-xs sm:text-sm">
                <div><span className="text-[10px] sm:text-xs font-semibold text-slate-400 block uppercase">CPF</span><span className="text-slate-700 font-mono font-medium">{formatarCPF(clienteSelecionado.cpf)}</span></div>
                <div><span className="text-[10px] sm:text-xs font-semibold text-slate-400 block uppercase">Nascimento</span><span className="text-slate-700 font-medium">{formatarDataBR(clienteSelecionado.dataNascimento)}</span></div>
                <div><span className="text-[10px] sm:text-xs font-semibold text-slate-400 block uppercase">Telefone</span><span className="text-slate-700 font-medium">{formatarTelefone(clienteSelecionado.telefone) || 'Não informado'}</span></div>
                <div><span className="text-[10px] sm:text-xs font-semibold text-slate-400 block uppercase">Cidade</span><span className="text-slate-700 font-medium">{clienteSelecionado.cidade || 'Não informada'}</span></div>
              </div>
            </div>

            {/* Painel Central das Vendas Acordeão */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <div className="flex items-center space-x-2 mb-6 border-b border-slate-100 pb-3">
                <ShoppingBag className="w-5 h-5 text-gold shrink-0" />
                <h3 className="font-bold text-royalBlue text-base sm:text-lg">Histórico de Compras Realizadas</h3>
              </div>

              {vendasAgrupadas.length > 0 ? (
                <div className="space-y-4">
                  {vendasAgrupadas.map(venda => (
                    <div key={venda.id} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                      
                      {/* BARRA DA VENDA MÃE */}
                      <div className="p-4 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-all select-none">
                        <div 
                          onClick={() => setVendaAbertaId(vendaAbertaId === venda.id ? null : venda.id)}
                          className="space-y-1.5 cursor-pointer w-full sm:flex-1 min-w-0"
                        >
                          <p className="font-bold text-slate-700 text-xs sm:text-sm break-words">{venda.produtos}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400 font-medium">
                            <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" /> {formatarDataBR(venda.data)}</span>
                            <span>Tipo: <strong className="text-royalBlue">{venda.metodo}</strong></span>
                            {venda.entrada > 0 && <span className="text-emerald-600 font-bold">Entrad.: R$ {venda.entrada.toFixed(2)}</span>}
                            {venda.desconto > 0 && <span className="text-rose-500 font-bold">Desc.: R$ {venda.desconto.toFixed(2)}</span>}
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 gap-3 shrink-0">
                          <p className="font-extrabold text-royalBlue text-sm sm:text-base">R$ {venda.totalVenda.toFixed(2)}</p>
                          <div className="flex items-center space-x-1.5">
                            <button 
                              onClick={() => handleEditarVenda(venda)}
                              className="p-1.5 bg-white text-slate-500 hover:bg-royalBlue hover:text-white rounded-md border border-slate-200 transition-colors"
                              title="Retificar Valor Total"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => handleRemoverVenda(venda.id)}
                              className="p-1.5 bg-white text-rose-500 hover:bg-rose-600 hover:text-white rounded-md border border-slate-200 transition-colors"
                              title="Estornar Venda Completa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <div 
                              onClick={() => setVendaAbertaId(vendaAbertaId === venda.id ? null : venda.id)}
                              className="cursor-pointer pl-1 px-2 py-1 hover:bg-slate-200/50 rounded-md"
                            >
                              {vendaAbertaId === venda.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* CONTEÚDO EXPANSÍVEL */}
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
                                  </div>
                                  <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-dashed border-slate-100">
                                    <p className="font-bold text-slate-800">R$ {parseFloat(parc.valor).toFixed(2)}</p>
                                    <div className="flex items-center space-x-2">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        parc.status === 'Pago' ? 'bg-emerald-50 text-emerald-700' :
                                        parc.status === 'Atrasado' ? 'bg-rose-50 text-rose-700 font-extrabold' : 'bg-amber-50 text-amber-700'
                                      }`}>{parc.status}</span>
                                      {parc.status !== 'Pago' ? (
                                        <button
                                          onClick={() => baixarParcelaDoCliente(parc, venda.produtos)}
                                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] sm:text-[11px] px-2.5 py-1 rounded transition-colors shadow-sm"
                                        >
                                          Liquidar
                                        </button>
                                      ) : (
                                        <span className="text-[11px] font-medium text-slate-400 italic bg-slate-100 px-2 py-0.5 rounded">Baixada</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-emerald-600 font-semibold bg-emerald-50 p-2.5 rounded border border-emerald-100 block w-full">
                              ✓ Venda à vista liquidada integralmente no momento da compra.
                            </p>
                          )}
                        </div>
                      )}

                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400 text-xs sm:text-sm border-2 border-dashed border-slate-100 rounded-xl">
                  Nenhum faturamento estruturado associado a este cliente.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LISTAGEM PRINCIPAL */}
      {abaAtiva === 'lista' && !clienteSelecionado && !carregando && (
        <div className="space-y-4">
          <div className="relative max-w-md w-full">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><Search className="w-4 h-4 text-slate-400" /></span>
            <input
              type="text"
              placeholder="Pesquisar cliente por nome ou CPF..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:border-royalBlue bg-white shadow-sm"
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
            />
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
                          <button onClick={() => setClienteSelecionado(cliente)} className="bg-gold text-wood-dark hover:bg-gold-dark font-bold text-[11px] px-2.5 py-1.5 rounded transition-colors shadow-sm">
                            Histórico
                          </button>
                          <button onClick={() => { iniciarEdicao(cliente); }} className="p-1.5 bg-slate-100 text-slate-600 hover:bg-royalBlue hover:text-white rounded-lg transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleExcluir(cliente.id, cliente.nome)} className="p-1.5 bg-slate-100 text-rose-600 hover:bg-rose-600 hover:text-white rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="5" className="text-center p-8 text-xs sm:text-sm text-slate-400">Nenhum cliente correspondente encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* FORMULÁRIO COMPLETO */}
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
                <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">CPF</label>
                <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-royalBlue" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Data de Nascimento</label>
                <input type="date" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-700 focus:outline-none" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} required />
              </div>
              <div>
                <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Telefone</label>
                <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none" placeholder="(88) 99999-0000" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
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
    </div>
  )
}