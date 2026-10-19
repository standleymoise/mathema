import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './ui/App'
import { initPwa } from './pwa'
import { onBackOnline } from './store/store'

initPwa(onBackOnline)

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
