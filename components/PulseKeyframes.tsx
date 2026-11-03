export default function PulseKeyframes() {
  return (
    <style jsx global>{`
      @keyframes pulse-green { 0%,100%{box-shadow:0 0 0 3px rgba(34,197,94,.3)} 50%{box-shadow:0 0 0 6px rgba(34,197,94,.5)} }
      @keyframes pulse-amber { 0%,100%{box-shadow:0 0 0 3px rgba(245,158,11,.3)} 50%{box-shadow:0 0 0 6px rgba(245,158,11,.5)} }
    `}</style>
  )
}
