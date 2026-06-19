import React from 'react'
import { User, Wifi, Store, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function Navbar({ usuarioLogado, setUsuarioLogado }) {
  const navigate = useNavigate()
  
  const handleLogout = () => {
    if (!window.confirm('Deseja realmente sair do sistema?')) return
    localStorage.removeItem('oticaLuz_user')
    setUsuarioLogado(null)
    navigate('/login')
  }

  const dataHoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return (
    <div className="bg-white h-16 border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-40 shadow-sm w-full">
      
      {/* LADO ESQUERDO: FILIAL E DATA */}
      <div className="flex items-center space-x-3 min-w-0">
        <div className="flex items-center space-x-1.5 text-[11px] font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full shrink-0">
          <Store className="w-3.5 h-3.5 text-royalBlue" />
          <span>Matriz</span>
        </div>
        <p className="text-xs text-slate-400 capitalize hidden lg:block truncate">{dataHoje}</p>
      </div>

      {/* LADO DIREITO: STATUS, PERFIL E LOGOUT */}
      <div className="flex items-center space-x-3 sm:space-x-6 shrink-0">
        
        {/* BANCO DE DADOS: Oculta o texto no mobile, mantendo apenas o ícone pulsante */}
        <div className="flex items-center space-x-1.5 text-emerald-600" title="Banco de Dados Turso Conectado">
          <Wifi className="w-4 h-4 animate-pulse shrink-0" />
          <span className="text-[10px] font-bold font-mono tracking-wider uppercase hidden sm:inline-block">Turso Online</span>
        </div>

        <div className="h-5 w-px bg-slate-200" />

        {/* PERFIL E LOGOUT */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          
          {/* Dados do usuário adaptáveis */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="text-right min-w-0 max-w-[80px] sm:max-w-[120px]">
              <p className="text-xs font-bold text-slate-700 truncate">{usuarioLogado?.nome || 'Operador'}</p>
              <p className="text-[9px] sm:text-[10px] text-slate-400 font-medium truncate hidden sm:block">{usuarioLogado?.cargo || 'Colaborador'}</p>
            </div>
            
            {/* Avatar discreto */}
            <div className="p-1.5 sm:p-2 bg-royalBlue/10 text-royalBlue rounded-lg sm:rounded-xl border border-royalBlue/20 shadow-sm shrink-0">
              <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>

          {/* Botão de Logout com área de toque otimizada no mobile */}
          <button 
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0 active:scale-95"
            title="Sair do Sistema"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  )
}