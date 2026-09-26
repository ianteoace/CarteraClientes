# Pedidos y comprobantes futuros

Los pedidos conservan importes e items estructurados con `Decimal`. Un comprobante futuro deberá guardar su propio snapshot inmutable al emitirse: no debe depender de que el pedido continúe sin cambios ni denominarse factura fiscal sin una integración fiscal específica.
