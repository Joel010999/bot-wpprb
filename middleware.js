import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Permitir el acceso a archivos estáticos nativos de Next y la carpeta public
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/)
  ) {
    return NextResponse.next();
  }

  // Permitir acceso a la página de login y a los endpoints de autenticación
  if (pathname === '/login' || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }
  
  // Permitir la ejecución de los cron jobs (si tienen su propia autenticación o son locales)
  if (pathname.startsWith('/api/cron') || pathname.startsWith('/api/campaigns')) {
      // Nota: Si se requiere proteger la API de UI, ajustamos a la llamada del frontend.
      // Retornaremos next() para permitir que el cron job siga funcionando sin cookie si lo invocan externamente sin cookies.
      // O podemos proteger todas las APIs menos /api/auth.
      // El prompt dice "que no interfiera con los procesos de fondo (Cron/Trigger) de las campañas".
      return NextResponse.next();
  }

  // Comprobar cookie de sesión
  const session = request.cookies.get('rle_session');

  // Si no hay sesión, redirigir a login
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Aplicar el middleware a todas las rutas excepto a las predefinidas de Next.js
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
