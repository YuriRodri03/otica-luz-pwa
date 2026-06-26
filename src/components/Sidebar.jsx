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
    { id: 'fluxo', label: 'Caixa', fullLabel: 'Fluxo de Caixa', icon: DollarSign },
    { id: 'crediario', label: 'Crediário', fullLabel: 'Crediário / Carnês', icon: FileText },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'usuarios', label: 'Equipe', fullLabel: 'Equipe / Usuários', icon: UserCheck },
    { id: 'whatsapp', label: 'Zap', fullLabel: 'Conexão WhatsApp', icon: MessageSquare },
  ]

  return (
    <>
      {/* ------------------------------------------------------------- */}
      {/* 1. VISÃO DESKTOP / TABLET: SIDEBAR LATERAL PREMIUM (FIXED)    */}
      {/* ------------------------------------------------------------- */}
      {/* 🔥 CORREÇÃO: Trocado a classe 'relative' por 'fixed top-0 left-0 bottom-0' para a barra colar no scroll */}
      <div 
        className={`hidden lg:flex fixed top-0 left-0 bottom-0 bg-royalBlue text-white flex-col border-r border-slate-800 transition-all duration-300 shrink-0 z-50 shadow-xl ${
          minimizado ? 'w-20' : 'w-64'
        }`}
      >
        {/* BOTÃO FLUTUANTE DE CONTROLE DE EXPANSÃO */}
        <button
          onClick={() => setMinimizado(!minimizado)}
          className="absolute -right-3 top-8 bg-slate-900 text-gold p-1 rounded-full border border-slate-800 hover:scale-110 shadow-lg transition-all z-50 active:scale-95"
          title={minimizado ? "Expandir Menu" : "Minimizar Menu"}
        >
          {minimizado ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        {/* LOGO / BRANDING */}
        <div className="p-6 text-center overflow-hidden whitespace-nowrap h-20 flex flex-col justify-center border-b border-white/5 bg-slate-950/20">
          {minimizado ? (
            <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-tr from-amber-300 to-gold tracking-wider">OL</h1>
          ) : (
            <div className="text-left px-2">
              <h1 className="text-lg font-extrabold tracking-wider text-white">
                ÓTICA <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-gold">LUZ</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wide uppercase mt-0.5">ERP comercial</p>
            </div>
          )}
        </div>
        
        {/* LINKS DE NAVEGAÇÃO INTERATIVOS */}
        <nav className="flex-1 p-3 space-y-1 overflow-x-hidden mt-4">
          {itensMenu.map((item) => {
            const Icone = item.icon
            const isActive = telaAtiva === item.id

            return (
              <button
                key={item.id}
                onClick={() => setTelaAtiva(item.id)}
                className={`
                  w-full flex items-center px-4 py-3 rounded-xl text-sm font-semibold transition-all group relative
                  ${isActive 
                    ? 'bg-gradient-to-r from-amber-400 to-gold text-slate-950 font-bold shadow-md shadow-gold/10' 
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }
                  ${minimizado ? 'justify-center space-x-0' : 'space-x-3.5'}
                `}
                title={minimizado ? item.label : ""}
              >
                <Icone className={`w-4 h-4 flex-shrink-0 transition-transform ${isActive ? 'scale-105' : 'group-hover:scale-105'}`} />
                {!minimizado && (
                  <span className="truncate tracking-wide text-xs">
                    {item.fullLabel || item.label}
                  </span>
                )}
                
                {/* Indicador luminoso lateral discreto no modo ativo */}
                {isActive && minimizado && (
                  <div className="absolute right-0 top-3 bottom-3 w-1 bg-slate-950 rounded-l-md" />
                )}
              </button>
            )
          })}
        </nav>
        
        {/* FOOTER DA SIDEBAR */}
        <div className="p-4 border-t border-white/5 text-center text-slate-500 text-[10px] font-semibold tracking-wider bg-slate-950/10">
          {minimizado ? "v1.3" : "SYSTEM V1.3.0 © ÓTICA LUZ"}
        </div>
      </div>

      {/* 🔥 FANTASMA COESOR DE LAYOUT: Como a Sidebar principal flutua em Fixed, 
          este bloco invisível ocupa o mesmo espaço horizontal em grid/flex, 
          impedindo que os módulos e painéis do main.jsx entrem debaixo dela. */}
      <div 
        className={`hidden lg:block shrink-0 transition-all duration-300 ${
          minimizado ? 'w-20' : 'w-64'
        }`} 
      />

      {/* ------------------------------------------------------------- */}
      {/* 2. VISÃO MOBILE: BARRA INFERIOR MODERNA (ESTILO MOBILE FIRST) */}
      {/* ------------------------------------------------------------- */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-950/95 backdrop-blur-md border-t border-white/5 text-white flex items-center justify-around px-3 z-50 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.3)]">
        {itensMenu.map((item) => {
          const Icone = item.icon
          const isActive = telaAtiva === item.id

          return (
            <button
              key={item.id}
              onClick={() => setTelaAtiva(item.id)}
              className="flex flex-col items-center justify-center flex-1 h-full py-1 transition-all active:scale-90 text-center relative"
            >
              <div 
                className={`p-1.5 rounded-xl flex flex-col items-center justify-center w-12 transition-all ${
                  isActive 
                    ? 'bg-gradient-to-b from-amber-400/20 to-gold/10 text-gold scale-105' 
                    : 'text-slate-400'
                }`}
              >
                <Icone className={`w-4 h-4 mb-0.5 ${isActive ? 'text-gold' : 'text-slate-400'}`} />
                <span className={`text-[9px] tracking-tight block font-medium truncate w-full ${isActive ? 'text-gold font-bold' : 'text-slate-500'}`}>
                  {item.label}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}