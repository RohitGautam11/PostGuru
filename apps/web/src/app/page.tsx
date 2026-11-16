import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default function Home() {
  redirect(cookies().has('sh_rt') ? '/dashboard' : '/login');
}
