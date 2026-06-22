import React, { useState } from 'react'
import { User, Wifi, Store, LogOut, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function Navbar({ usuarioLogado, setUsuarioLogado }) {
  const navigate = useNavigate()
  const [confirmarLogout, setConfirmarLogout] = useState(false)
  
  const handleLogoutReal = () => {
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
    <>
      <div className="bg-white/80 backdrop-blur-md h-16 border-b border-slate-100 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-40 shadow-sm w-full">
        
        {/* LADO ESQUERDO: FILIAL E DATA */}
        <div className="flex items-center space-x-4 min-w-0">
          <div className="flex items-center space-x-1.5 text-[11px] font-bold bg-royalBlue/5 text-royalBlue px-3 py-1.5 rounded-full border border-royalBlue/10 shrink-0 shadow-sm">
            <Store className="w-3.5 h-3.5" />
            <span>Matriz</span>
          </div>
          <p className="text-xs font-medium text-slate-400 capitalize hidden lg:block truncate">{dataHoje}</p>
        </div>

        {/* LADO DIREITO: STATUS, PERFIL E LOGOUT */}
        <div className="flex items-center space-x-3 sm:space-x-6 shrink-0">
          
          {/* BANCO DE DADOS */}
          <div className="flex items-center space-x-1.5 text-emerald-600 bg-emerald-50/50 px-2.5 py-1.5 rounded-xl border border-emerald-100/50" title="Banco de Dados Turso Conectado">
            <Wifi className="w-4 h-4 animate-pulse shrink-0" />
            <span className="text-[10px] font-bold font-mono tracking-wider uppercase hidden sm:inline-block">Turso Online</span>
          </div>

          <div className="h-5 w-px bg-slate-200/60" />

          {/* PERFIL E LOGOUT */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            
            {/* DADOS DO USUÁRIO */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="text-right min-w-0 max-w-[90px] sm:max-w-[140px]">
                <p className="text-xs font-bold text-slate-700 truncate leading-tight">{usuarioLogado?.nome || 'Operador'}</p>
                <p className="text-[10px] text-slate-400 font-medium truncate hidden sm:block mt-0.5">{usuarioLogado?.cargo || 'Colaborador'}</p>
              </div>
              
              {/* AVATAR DISCRETO */}
              <div className="p-2 bg-gradient-to-tr from-royalBlue/10 to-royalBlue/5 text-royalBlue rounded-xl border border-royalBlue/10 shadow-inner shrink-0">
                <User className="w-4 h-4" />
              </div>
            </div>

            {/* BOTÃO DE LOGOUT RETILÍNEO */}
            <button 
              onClick={() => setConfirmarLogout(true)}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50/80 rounded-xl transition-all shrink-0 active:scale-95 border border-transparent hover:border-rose-100"
              title="Sair do Sistema"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>

      {/* 🔔 MODAL DE CONFIRMAÇÃO DE LOGOUT MODERNO (SUBSTITUTO DO WINDOW.CONFIRM) */}
      {confirmarLogout && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border-t-4 border-gold">
            <div className="p-5 space-y-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-800 tracking-tight">Sair da Plataforma</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">Deseja realmente encerrar sua sessão atual na Ótica Luz?</p>
                </div>
              </div>

              <div className="flex space-x-2 pt-1 justify-end">
                <button 
                  type="button" 
                  onClick={() => setConfirmarLogout(false)} 
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                >
                  Não, voltar
                </button>
                <button 
                  type="button" 
                  onClick={handleLogoutReal} 
                  className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-colors border-b-2 border-rose-800"
                >
                  Sim, sair
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}