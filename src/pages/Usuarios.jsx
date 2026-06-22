import React, { useState, useEffect } from 'react'
import { Loader2, UserPlus, Shield, Mail, Lock, UserCheck, Trash2, AlertTriangle, XCircle, CheckCircle } from 'lucide-react'
import { turso } from '../tursoClient'

export default function Usuarios() {
  const [listaUsuarios, setListaUsuarios] = useState([])
  const [carregando, setCarregando] = useState(false)

  // Recupera o ID e o cargo do administrador logado na sessão atual
  const usuarioSessao = JSON.parse(localStorage.getItem('oticaLuz_user') || '{}')
  const estaLogado = !!usuarioSessao.id 
  const éAdministrador = usuarioSessao.cargo === 'Administrador'

  // Estados do formulário
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [cargo, setCargo] = useState('Vendedor')

  // ==========================================
  // ESTADO PARA MODAL DE AVISO / CONFIRMAÇÃO INTEGRADO
  // ==========================================
  const [alertaConfig, setAlertaConfig] = useState({
    aberto: false,
    tipo: 'aviso', // 'confirmacao' | 'erro' | 'sucesso'
    titulo: '',
    mensagem: '',
    onConfirmar: null
  })

  const carregarUsuarios = async () => {
    if (!estaLogado) return
    
    setCarregando(true)
    try {
      const resultado = await turso.execute("SELECT id, nome, email, cargo FROM usuarios ORDER BY nome ASC")
      const mapeado = resultado.rows.map(row => ({
        id: row.id,
        nome: row.nome,
        email: row.email,
        cargo: row.cargo
      }))
      setListaUsuarios(mapeado)
    } catch (error) {
      console.error("Erro ao buscar usuários:", error)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarUsuarios()
  }, [])

  const handleCadastrarUsuario = async (e) => {
    e.preventDefault()
    if (!nome || !email || !senha) return

    const cargoFinal = éAdministrador ? cargo : 'Vendedor'

    try {
      await turso.execute({
        sql: "INSERT INTO usuarios (nome, email, senha, cargo) VALUES (?, ?, ?, ?)",
        args: [nome.trim(), email.trim().toLowerCase(), senha, cargoFinal]
      })

      setAlertaConfig({
        aberto: true,
        tipo: 'sucesso',
        titulo: 'Sucesso',
        mensagem: `Usuário ${nome} cadastrado com sucesso como ${cargoFinal}!`,
        onConfirmar: null
      })

      setNome('')
      setEmail('')
      setSenha('')
      setCargo('Vendedor')
      
      if (estaLogado) {
        await carregarUsuarios()
      }
    } catch (error) {
      console.error("Erro ao cadastrar usuário:", error)
      setAlertaConfig({
        aberto: true,
        tipo: 'erro',
        titulo: 'Falha no Cadastro',
        mensagem: 'Erro ao cadastrar! Verifique se este e-mail já está em uso na equipe.',
        onConfirmar: null
      })
    }
  }

  const handleDeletarUsuario = (id, nomeUser) => {
    if (!estaLogado) return

    if (id === usuarioSessao.id) {
      setAlertaConfig({
        aberto: true,
        tipo: 'erro',
        titulo: 'Operação Negada',
        mensagem: 'Você não pode revogar o seu próprio acesso enquanto estiver logado no sistema.',
        onConfirmar: null
      })
      return
    }

    setAlertaConfig({
      aberto: true,
      tipo: 'confirmacao',
      titulo: 'Remover Operador',
      mensagem: `Tem certeza que deseja remover o acesso de "${nomeUser}" do sistema permanentemente?`,
      onConfirmar: async () => {
        try {
          await turso.execute({
            sql: "DELETE FROM usuarios WHERE id = ?",
            args: [id]
          })
          await carregarUsuarios()
          setAlertaConfig({
            aberto: true,
            tipo: 'sucesso',
            titulo: 'Acesso Revogado',
            mensagem: 'O usuário foi removido do quadro de funcionários ativos.',
            onConfirmar: null
          })
        } catch (error) {
          console.error("Erro ao remover usuário:", error)
          setAlertaConfig({
            aberto: true,
            tipo: 'erro',
            titulo: 'Erro Operacional',
            mensagem: 'Não foi possível excluir o usuário selecionado no banco Turso.',
            onConfirmar: null
          })
        }
      }
    })
  }

  return (
    <div className="space-y-6 px-1 sm:px-4 max-w-full overflow-hidden animate-fadeIn">
      
      {/* CABEÇALHO RESPONSIVO */}
      <header className="border-b border-slate-200 pb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-royalBlue tracking-tight">
          {estaLogado ? 'Gerenciamento da Equipe' : 'Cadastro de Operador'}
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          {estaLogado 
            ? 'Cadastre novos operadores e controle as permissões de acesso da Ótica Luz.' 
            : 'Crie uma nova conta corporativa para acessar o Painel Comercial.'}
        </p>
      </header>

      {/* COMPORTAMENTO DINÂMICO DE GRIDS */}
      <div className={estaLogado ? "grid grid-cols-1 lg:grid-cols-3 gap-6" : "w-full max-w-md mx-auto"}>
        
        {/* FORMULÁRIO DE CADASTRO */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-fit w-full">
          <div className="bg-royalBlue p-4 text-white font-bold border-b-4 border-gold text-xs sm:text-sm flex items-center space-x-2">
            <UserPlus className="w-4 h-4 shrink-0" />
            <span>Novo Operador / Colaborador</span>
          </div>

          <form onSubmit={handleCadastrarUsuario} className="p-4 sm:p-6 space-y-4">
            <div>
              <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Nome Completo</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><UserCheck className="w-4 h-4 text-slate-400" /></span>
                <input type="text" className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:border-royalBlue bg-white" placeholder="Ex: Ana Clara Lima" value={nome} onChange={(e) => setNome(e.target.value)} required />
              </div>
            </div>

            <div>
              <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">E-mail de Acesso</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><Mail className="w-4 h-4 text-slate-400" /></span>
                <input type="email" className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:border-royalBlue bg-white" placeholder="nome@oticaluz.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </div>

            <div>
              <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Senha Inicial</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><Lock className="w-4 h-4 text-slate-400" /></span>
                <input type="password" className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:border-royalBlue bg-white" placeholder="••••••••" value={senha} onChange={(e) => setSenha(e.target.value)} required />
              </div>
            </div>

            <div>
              <label className="block text-[10px] sm:text-xs font-semibold text-slate-600 uppercase mb-1">Nível de Permissão (Cargo)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><Shield className="w-4 h-4 text-slate-400" /></span>
                
                {éAdministrador ? (
                  <select 
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:border-royalBlue text-slate-700 bg-white font-medium cursor-pointer" 
                    value={cargo} 
                    onChange={(e) => setCargo(e.target.value)}
                  >
                    <option value="Vendedor">Vendedor / Atendente</option>
                    <option value="Gerente">Gerente de Caixa</option>
                    <option value="Administrador">Administrador Geral</option>
                  </select>
                ) : (
                  <input 
                    type="text"
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-xs sm:text-sm bg-slate-50 text-slate-400 font-bold cursor-not-allowed"
                    value="Vendedor / Atendente (Padrão)"
                    disabled
                  />
                )}
              </div>
            </div>

            <button type="submit" className="w-full bg-royalBlue hover:bg-royalBlue-light active:scale-[0.99] text-white font-semibold py-2 rounded-lg border-b-2 border-gold shadow-md text-xs sm:text-sm transition-all mt-2">
              Concluir Cadastro
            </button>
          </form>
        </div>

        {/* LISTAGEM DE USUÁRIOS ATIVOS */}
        {estaLogado && (
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
            {carregando ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <Loader2 className="w-8 h-8 text-royalBlue animate-spin mb-2" />
                <p className="text-xs sm:text-sm text-slate-500">Carregando quadro de funcionários...</p>
              </div>
            ) : (
              <div className="w-full overflow-x-auto min-w-full inline-block align-middle">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 text-[10px] sm:text-xs uppercase font-semibold border-b border-slate-200">
                      <th className="p-3 sm:p-4">Nome do Usuário</th>
                      <th className="p-3 sm:p-4">E-mail</th>
                      <th className="p-3 sm:p-4">Nível</th>
                      <th className="p-3 sm:p-4 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                    {listaUsuarios.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 sm:p-4 font-semibold text-slate-700">
                          {user.nome} {user.id === usuarioSessao.id && <span className="text-[11px] text-slate-400 font-normal italic">(Você)</span>}
                        </td>
                        <td className="p-3 sm:p-4 text-slate-500 font-mono text-xs max-w-[150px] sm:max-w-none truncate" title={user.email}>
                          {user.email}
                        </td>
                        <td className="p-3 sm:p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold ${
                            user.cargo === 'Administrador' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                            user.cargo === 'Gerente' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {user.cargo}
                          </span>
                        </td>
                        <td className="p-3 sm:p-4 text-center">
                          <button 
                            type="button"
                            onClick={() => handleDeletarUsuario(user.id, user.nome)}
                            disabled={user.id === usuarioSessao.id}
                            className={`p-1.5 rounded-lg transition-colors ${
                              user.id === usuarioSessao.id 
                                ? 'text-slate-200 cursor-not-allowed' 
                                : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                            }`}
                            title={user.id === usuarioSessao.id ? "Seu usuário ativo" : "Bloquear/Revogar acesso"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🔔 MODAL DE ALERTA E CONFIRMAÇÃO INTEGRADO DA ÓTICA LUZ */}
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
                    <button 
                      type="button" 
                      onClick={() => setAlertaConfig(prev => ({ ...prev, aberto: false }))} 
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors"
                    >
                      Não, manter
                    </button>
                    <button 
                      type="button" 
                      onClick={() => {
                        if (alertaConfig.onConfirmar) alertaConfig.onConfirmar();
                        setAlertaConfig(prev => ({ ...prev, aberto: false }));
                      }} 
                      className="bg-royalBlue text-white px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold border-b-2 border-gold shadow-sm transition-colors"
                    >
                      Sim, executar
                    </button>
                  </>
                ) : (
                  <button 
                    type="button" 
                    onClick={() => setAlertaConfig(prev => ({ ...prev, aberto: false }))} 
                    className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors"
                  >
                    Entendido
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}