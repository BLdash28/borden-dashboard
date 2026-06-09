'use client'
import { useState, useRef, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { isToolUIPart } from 'ai'
import { X, MessageCircle, Send, Loader2, FileDown, Bot } from 'lucide-react'

export default function Elsie() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // api defaults to /api/chat in DefaultChatTransport
  const { messages, sendMessage, status, error } = useChat()
  const isLoading = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function downloadPdf(base64: string, filename: string) {
    const link = document.createElement('a')
    link.href = `data:application/pdf;base64,${base64}`
    link.download = filename
    link.click()
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage({ text: input })
    setInput('')
  }

  function quickSend(text: string) {
    sendMessage({ text })
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-xl flex items-center justify-center transition-all active:scale-95"
        aria-label="Abrir Elsie"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[360px] max-w-[calc(100vw-24px)] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
          style={{ height: '520px' }}>

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-amber-500 text-white flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Bot size={16} />
            </div>
            <div>
              <p className="text-sm font-bold leading-none">Elsie</p>
              <p className="text-[10px] text-amber-100 mt-0.5">Asistente BL Foods</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm min-h-0">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 mt-6 space-y-2">
                <Bot size={32} className="mx-auto text-amber-300" />
                <p className="text-xs px-2">Hola, soy Elsie. Puedo consultarte ventas, inventario, sell-in y generar reportes en PDF.</p>
                <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                  {[
                    '¿Cuánto vendimos en mayo 2025?',
                    'Top SKUs en Guatemala',
                    'Inventario CEDI Costa Rica',
                    'Sell-in Walmart 2025',
                  ].map(s => (
                    <button key={s} onClick={() => quickSend(s)}
                      className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1 hover:bg-amber-100 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center mr-2 mt-0.5 flex-shrink-0">
                    <Bot size={12} className="text-amber-600" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed
                  ${m.role === 'user'
                    ? 'bg-amber-500 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
                  {m.parts.map((part, pi) => {
                    if (part.type === 'text') {
                      return <span key={pi} className="whitespace-pre-wrap">{part.text}</span>
                    }
                    if (isToolUIPart(part)) {
                      if (part.state === 'output-available') {
                        const res = part.output as any
                        if (res?.base64 && res?.filename) {
                          return (
                            <button key={pi}
                              onClick={() => downloadPdf(res.base64, res.filename)}
                              className="flex items-center gap-2 mt-2 bg-white border border-amber-200 text-amber-700 rounded-lg px-3 py-2 hover:bg-amber-50 transition-colors w-full">
                              <FileDown size={14} />
                              <span className="text-[11px] font-medium">{res.filename}</span>
                              <span className="text-[10px] text-gray-400 ml-auto">{res.size_kb} KB</span>
                            </button>
                          )
                        }
                      }
                      if (part.state === 'input-streaming' || part.state === 'input-available') {
                        return (
                          <span key={pi} className="text-[10px] text-gray-400 italic block mt-1">
                            Consultando datos...
                          </span>
                        )
                      }
                    }
                    return null
                  })}
                </div>
              </div>
            ))}

            {isLoading && messages.at(-1)?.role !== 'assistant' && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center mr-2 flex-shrink-0">
                  <Bot size={12} className="text-amber-600" />
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2">
                  <Loader2 size={14} className="animate-spin text-amber-500" />
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-500 text-center">Error al conectar. Intenta de nuevo.</p>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t border-gray-100 flex-shrink-0">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Pregunta sobre ventas, inventario..."
              disabled={isLoading}
              className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-50"
            />
            <button type="submit" disabled={isLoading || !input.trim()}
              className="w-8 h-8 rounded-xl bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center disabled:opacity-40 transition-colors flex-shrink-0">
              <Send size={13} />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
