import Gallery from "@/components/Gallery";

export default function Home() {
  const eventKey = process.env.NEXT_PUBLIC_EVENT_KEY;
  if (eventKey) {
    return <Gallery eventKey={eventKey} />;
  }
  return <main className="landing"><h1>Weddind Photo System</h1><p>.env.local に EVENT_KEY を設定してください。</p></main>;
}
