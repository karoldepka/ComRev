import { redirect } from 'next/navigation';

export default function Home() {
  redirect(`/t/${process.env.NEXT_PUBLIC_TABLE_ID ?? '_default'}`);
}
