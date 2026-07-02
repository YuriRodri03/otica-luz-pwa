import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import './index.css'
import { turso } from './tursoClient' 
import { Loader2, ShieldCheck } from 'lucide-react'

// IMPORTAÇÃO DOS COMPONENTES DE LAYOUT
import Sidebar from './components/Sidebar'
import Navbar from './components/Navbar'

// IMPORTAÇÃO DAS PÁGINAS
import Dashboard from './pages/Dashboard'
import FluxoCaixa from './pages/FluxoCaixa'
import Crediario from './pages/Crediario'
import Clientes from './pages/Clientes'
import Usuarios from './pages/Usuarios'    
import Login from './pages/Login'    
import Whatsapp from './pages/Whatsapp'

function PainelInterno({ 
  usuarioLogado, 
  setUsuarioLogado, 
  clientes, 
  setClientes, 
  carregarDadosIniciais, 
  lancamentos, 
  crediarios, 
  setCrediarios, 
  setLancamentos, 
  carregando 
}) {
  const location = useLocation()
  const navigate = useNavigate()

  // Sincroniza a string amigável para enviar ao Sidebar caso ele use a prop telaAtiva
  const mapearRotaParaTela = () => {
    const path = location.pathname
    if (path === '/') return 'dashboard'
    return path.replace('/', '')
  }

  // Função substituta para o Sidebar continuar mudando as telas normalmente
  const setTelaAtiva = (novaTela) => {
    if (novaTela === 'dashboard') {
      navigate('/')
    } else {
      navigate(`/${novaTela}`)
    }
  }

  return (
    <div className="flex bg-slate-50 min-h-screen relative overflow-hidden">
      
      {/* EFEITO DE BRILHO FLUIDO NO BACKGROUND */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vh] rounded-full bg-gradient-to-br from-gold/10 to-transparent blur-[120px] pointer-events-none animate-pulse duration-[6000ms]" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[45vw] h-[45vh] rounded-full bg-gradient-to-tl from-royalBlue/5 to-transparent blur-[100px] pointer-events-none animate-pulse duration-[8000ms]" />
      <div className="absolute top-[30%] right-[20%] w-[15vw] h-[15vh] rounded-full bg-gold/5 blur-[60px] pointer-events-none animate-pulse duration-[4000ms]" />

      {/* Menu Lateral Adaptado para ler a URL real */}
      <Sidebar className="relative z-10" telaAtiva={mapearRotaParaTela()} setTelaAtiva={setTelaAtiva} />
      
      {/* Bloco de Conteúdo da Direita */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <Navbar usuarioLogado={usuarioLogado} setUsuarioLogado={setUsuarioLogado} />
        
        <main className="flex-1 p-8 max-w-7xl mx-auto w-full overflow-y-auto">
          {carregando && (
            <div className="text-xs font-semibold text-slate-400 animate-pulse mb-4 flex items-center space-x-2">
              <Loader2 className="w-3 h-3 animate-spin text-royalBlue" />
              <span>Sincronizando dados dinamicamente com o banco de dados...</span>
            </div>
          )}
          
          {/* 🔥 AGORA USANDO ROTAS REAIS: Dados limpos e ciclo de vida reativo */}
          <Routes>
            <Route path="/" element={<Dashboard lancamentos={lancamentos} clientes={clientes} />} />
            <Route path="/fluxo" element={<FluxoCaixa lancamentos={lancamentos} setLancamentos={setLancamentos} clientes={clientes} carregarLancamentosDoBanco={carregarDadosIniciais} />} />
            <Route path="/crediario" element={<Crediario crediarios={crediarios} setCrediarios={setCrediarios} lancamentos={lancamentos} setLancamentos={setLancamentos} atualizarDados={carregarDadosIniciais} />} />
            <Route path="/clientes" element={<Clientes clientes={clientes} setClientes={setClientes} atualizarClientesDoBanco={carregarDadosIniciais} />} />
            <Route path="/usuarios" element={<Usuarios />} />
            <Route path="/whatsapp" element={<Whatsapp />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function App() {
  const [usuarioLogado, setUsuarioLogado] = useState(() => {
    const salvo = localStorage.getItem('oticaLuz_user')
    return salvo ? JSON.parse(salvo) : null
  })

  const [lancamentos, setLancamentos] = useState([])
  const [clientes, setClientes] = useState([])
  const [crediarios, setCrediarios] = useState([])
  const [carregando, setCarregando] = useState(false)

  const carregarDadosIniciais = async () => {
    if (!usuarioLogado) return
    setCarregando(true)

    try {
      const [resClientes, resLancamentos] = await Promise.all([
        turso.execute("SELECT * FROM clientes ORDER BY nome ASC"),
        turso.execute("SELECT * FROM vendas ORDER BY criado_em DESC")
      ])

      if (resClientes.rows) setClientes(resClientes.rows)
      if (resLancamentos.rows) setLancamentos(resLancamentos.rows)
      
    } catch (error) {
      console.error("Erro no carregamento conjunto do banco:", error)
    } finally { 
      setCarregando(false)
    }
  }

  useEffect(() => {
    if (usuarioLogado) {
      carregarDadosIniciais()
    }
  }, [usuarioLogado])

  if (usuarioLogado && carregando && clientes.length === 0) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-slate-900 text-white z-[9999]">
        <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl flex flex-col items-center max-w-sm w-full mx-4 text-center space-y-4 relative overflow-hidden">
          <div className="absolute top-[-20%] left-[-20%] w-32 h-32 bg-gold/10 rounded-full blur-xl pointer-events-none" />
          <div className="absolute bottom-[-20%] right-[-20%] w-32 h-32 bg-royalBlue/10 rounded-full blur-xl pointer-events-none" />
          <div className="relative flex items-center justify-center">
            <Loader2 className="w-12 h-12 text-gold animate-spin relative z-10" />
            <ShieldCheck className="w-5 h-5 text-royalBlue absolute z-10" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100 tracking-wide">Ótica Luz</h3>
            <p className="text-xs text-slate-400 mt-1">Sincronizando tabelas com a base de dados Turso...</p>
          </div>
          <div className="w-full bg-slate-700 h-1 rounded-full overflow-hidden">
            <div className="bg-gold h-full w-2/3 animate-pulse rounded-full" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!usuarioLogado ? <Login setUsuarioLogado={setUsuarioLogado} /> : <Navigate to="/" replace />} />
        <Route path="/*" element={
          usuarioLogado ? (
            <PainelInterno 
              usuarioLogado={usuarioLogado} 
              setUsuarioLogado={setUsuarioLogado}
              clientes={clientes}
              setClientes={setClientes} 
              carregarDadosIniciais={carregarDadosIniciais}
              lancamentos={lancamentos}
              crediarios={crediarios}
              setCrediarios={setCrediarios}
              setLancamentos={setLancamentos}
              carregando={carregando}
            />
          ) : (
            <Navigate to="/login" replace />
          )
        } />
      </Routes>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)