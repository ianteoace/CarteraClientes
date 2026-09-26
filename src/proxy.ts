import { auth } from "@/lib/auth/server";

export default auth.middleware({ loginUrl: "/login" });

export const config = {
  matcher: ["/", "/clientes/:path*", "/grupos/:path*", "/campanas/:path*", "/equipo/:path*", "/actividad/:path*", "/configuracion/:path*", "/seleccionar-cartera"],
};
