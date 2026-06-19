import React, { useState, useEffect } from 'react'
import { 
  LayoutDashboard, DollarSign, FileText, Users, UserCheck, 
  MessageSquare, ChevronLeft, ChevronRight 
} from 'lucide-react'

export default function Sidebar({ telaAtiva, setTelaAtiva }) {
  // Inicializa o estado lendo direto do localStorage para persistir a escolha
  const [minimizado, setMinimizado] = useState(() => {
    const salvo = localStorage.getItem('oticaLuz_sidebar_min')
    return salvo === 'true'
  })

  // Efeito para salvar a escolha do usuário toda vez que ele alternar o botão
  useEffect(() => {
    localStorage.setItem('oticaLuz_sidebar_min', minimizado)
  }, [minimizado])

  // Lista mapeada com os IDs de controle que configuramos no main.jsx
  const itensMenu = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'fluxo', label: 'Caixa', icon: DollarSign }, // Reduzido "Fluxo" para mobile
    { id: 'crediario', label: 'Crediário', icon: FileText }, // Reduzido para mobile
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'usuarios', label: 'Equipe', icon: UserCheck },
    { id: 'whatsapp', label: 'Zap', icon: MessageSquare },
  ]

  return (
    <>
      {/* ------------------------------------------------------------- */}
      {/* 1. VISÃO DESKTOP / TABLET: SIDEBAR LATERAL PADRÃO              */}
      {/* ------------------------------------------------------------- */}
      <div 
        className={`hidden lg:flex h-screen bg-royalBlue text-white flex-col border-r-4 border-gold sticky top-0 transition-all duration-300 relative shrink-0 ${
          minimizado ? 'w-20' : 'w-64'
        }`}
      >
        {/* BOTÃO FLUTUANTE PARA MINIMIZAR/EXPANDIR */}
        <button
          onClick={() => setMinimizado(!minimizado)}
          className="absolute -right-3 top-20 bg-gold text-wood-dark p-1 rounded-full border border-gold hover:scale-110 shadow-md transition-all z-50"
          title={minimizado ? "Expandir Menu" : "Minimizar Menu"}
        >
          {minimizado ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {/* LOGO / BRANDING */}
        <div className="p-6 border-b border-royalBlue-light text-center overflow-hidden whitespace-nowrap h-24 flex flex-col justify-center">
          {minimizado ? (
            <h1 className="text-xl font-black text-gold font-serif">OL</h1>
          ) : (
            <>
              <h1 className="text-xl font-bold tracking-wider">
                ÓTICA <span className="text-gold">LUZ</span>
              </h1>
              <p className="text-xs text-slate-300 mt-1">Gestão Comercial & Financeira</p>
            </>
          )}
        </div>
        
        {/* LINKS DE NAVEGAÇÃO POR BOTÕES DE ESTADO */}
        <nav className="flex-1 p-4 space-y-2 overflow-x-hidden">
          {itensMenu.map((item) => {
            const Icone = item.icon
            const isActive = telaAtiva === item.id

            return (
              <button
                key={item.id}
                onClick={() => setTelaAtiva(item.id)}
                className={`
                  w-full flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-all group
                  ${isActive ? 'bg-gold text-wood-dark font-bold shadow-md' : 'hover:bg-royalBlue-light text-slate-200'}
                  ${minimizado ? 'justify-center space-x-0' : 'space-x-3'}
                `}
                title={minimizado ? item.label : ""}
              >
                <Icone className="w-5 h-5 flex-shrink-0" />
                {!minimizado && <span className="animate-fadeIn">{item.id === 'fluxo' ? 'Fluxo de Caixa' : item.id === 'crediario' ? 'Crediário / Carnês' : item.id === 'usuarios' ? 'Equipe / Usuários' : item.id === 'whatsapp' ? 'Conexão WhatsApp' : item.label}</span>}
              </button>
            )
          })}
        </nav>
        
        {/* FOOTER DA SIDEBAR */}
        <div className="p-4 border-t border-royalBlue-light text-center text-slate-400 text-xs whitespace-nowrap overflow-hidden">
          {minimizado ? "v1.3" : "v1.3.0 © Ótica Luz"}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. VISÃO MOBILE: BARRA DE NAVEGAÇÃO INFERIOR ESTILO APP (PWA) */}
      {/* ------------------------------------------------------------- */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-royalBlue border-t-4 border-gold text-white flex items-center justify-around px-2 z-50 shadow-2xl">
        {itensMenu.map((item) => {
          const Icone = item.icon
          const isActive = telaAtiva === item.id

          return (
            <button
              key={item.id}
              onClick={() => setTelaAtiva(item.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-all active:scale-95 text-center truncate ${
                isActive ? 'text-gold font-bold bg-royalBlue-light/40 border-b-2 border-gold' : 'text-slate-300'
              }`}
            >
              <Icone className={`w-5 h-5 mb-0.5 shrink-0 ${isActive ? 'text-gold' : 'text-slate-300'}`} />
              <span className="text-[10px] tracking-tight block truncate w-full max-w-[55px]">
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}