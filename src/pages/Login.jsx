import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingBag, Loader2, Lock, Mail } from 'lucide-react'
import { turso } from '../tursoClient'

export default function Login({ setUsuarioLogado }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setCarregando(true)
    setErro('')

    try {
      // Busca o usuário pelo e-mail informado
      const resultado = await turso.execute({
        sql: "SELECT * FROM usuarios WHERE email = ? LIMIT 1",
        args: [email.trim()]
      })

      if (resultado.rows.length === 0) {
        setErro('E-mail ou senha incorretos.')
        setCarregando(false)
        return
      }

      const usuario = resultado.rows[0]

      // Verificação simples de senha (em produção, utilize hashes criptografados)
      if (usuario.senha === senha) {
        const dadosSession = {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          cargo: usuario.cargo
        }

        // Salva no localStorage para manter logado mesmo se atualizar a página
        localStorage.setItem('oticaLuz_user', JSON.stringify(dadosSession))
        setUsuarioLogado(dadosSession)
        navigate('/') // Redireciona para a Dashboard
      } else {
        setErro('E-mail ou senha incorretos.')
      }
    } catch (error) {
      console.error("Erro na autenticação:", error)
      setErro('Erro ao conectar com o servidor.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    /* ALTERADO: De 'fixed' para 'min-h-screen' com scroll flexível para evitar que o teclado do celular cubra o botão */
    <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-gold my-auto">
        
        <div className="bg-royalBlue p-6 text-white text-center">
          <div className="flex items-center justify-center space-x-2 mb-2">
            <ShoppingBag className="w-6 h-6 text-gold shrink-0" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-wider">ÓTICA <span className="text-gold">LUZ</span></h1>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-300">Painel de Controle Comercial</p>
        </div>

        <form onSubmit={handleLogin} className="p-5 sm:p-8 space-y-4">
          {erro && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-lg">
              ✕ {erro}
            </div>
          )}

          <div>
            <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">E-mail Corporativo</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><Mail className="w-4 h-4 text-slate-400" /></span>
              <input 
                type="email" 
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:border-royalBlue bg-white h-10 sm:h-auto"
                placeholder="nome@oticaluz.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Senha de Acesso</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><Lock className="w-4 h-4 text-slate-400" /></span>
              <input 
                type="password" 
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:border-royalBlue bg-white h-10 sm:h-auto"
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="w-full bg-royalBlue hover:bg-royalBlue-light text-white font-bold py-2.5 rounded-lg border-b-2 border-gold shadow-md transition-all text-xs sm:text-sm flex items-center justify-center space-x-2 active:scale-[0.99] h-10 sm:h-auto"
          >
            {carregando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Autenticando...</span>
              </>
            ) : (
              <span>Entrar no Sistema</span>
            )}
          </button>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => navigate('/usuarios')}
              className="text-[11px] sm:text-xs font-semibold text-royalBlue hover:text-royalBlue-light hover:underline transition-all p-1"
            >
              Precisa cadastrar um operador? Gerenciar Equipe
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}