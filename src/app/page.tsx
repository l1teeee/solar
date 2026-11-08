import Image from "next/image";
import { CloudScene } from "@/features/cloud-weather/ui/CloudScene";

export default function Home() {
  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <Image
        src="/images/paper-texture.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="pointer-events-none select-none object-cover"
      />
      <h1 className="sr-only">Solar</h1>
      <CloudScene />
    </main>
  );
}
