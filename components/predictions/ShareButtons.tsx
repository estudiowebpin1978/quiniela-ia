"use client"

interface ShareButtonsProps {
  turno: string;
  numbers: string[];
  appUrl: string;
}

export default function ShareButtons({ turno, numbers, appUrl }: ShareButtonsProps) {
  const shareText = `Mis predicciones de ${turno}: ${numbers.join(", ")} - Análisis de Quiniela IA`
  const shareUrl = appUrl

  const shareWhatsApp = () => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + " " + shareUrl)}`, "_blank")
  }

  const shareFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`, "_blank")
  }

  const shareX = () => {
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, "_blank")
  }

  const shareTelegram = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, "_blank")
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareText + " " + shareUrl)
  }

  return (
    <div className="shr-b">
      <button onClick={shareWhatsApp} style={{ background: "#25D366", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>WhatsApp</button>
      <button onClick={shareFacebook} style={{ background: "#1877F2", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Facebook</button>
      <button onClick={shareX} style={{ background: "#000", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>X</button>
      <button onClick={shareTelegram} style={{ background: "#0088cc", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Telegram</button>
      <button onClick={copyToClipboard} style={{ background: "rgba(255,255,255,.08)", color: "#94a3b8", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Copiar</button>
    </div>
  )
}
