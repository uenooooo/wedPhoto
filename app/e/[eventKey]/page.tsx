import { notFound } from "next/navigation";
import Gallery from "@/components/Gallery";

export default async function EventPage({ params }: { params: Promise<{ eventKey: string }> }) {
  const { eventKey } = await params;
  if (!process.env.EVENT_KEY || eventKey !== process.env.EVENT_KEY) notFound();
  return <Gallery eventKey={eventKey} />;
}
