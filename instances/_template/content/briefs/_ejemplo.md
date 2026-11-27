---
# Brief de ejemplo para `pnpm instance:landing:generate <id> <slug> --brief <ruta>`.
# Contenido ficticio: cópialo a instances/<id>/content/briefs/<slug>.md y sustitúyelo.
# Nunca pongas datos de leads (nombres, teléfonos, emails) en un brief.

# Segmento de viajero: uno de los `segments` de instance.yaml.
segment: adventure
# Tours del catálogo que ilustra la landing (al menos uno).
tourIds:
  - tour-ejemplo-4d
# Días del viaje: el itinerario tendrá exactamente este número de días.
days: 4
# Opcional. Precio orientativo «desde», por persona, en la moneda del mercado.
# Solo se usa en priceGuidance; los textos nunca llevan importes.
priceFrom: 890
# whatsapp | form
ctaType: whatsapp
# Opcional. El mensaje predefinido de WhatsApp terminará en [EJEMPLO-01].
campaignCode: EJEMPLO-01
---

Hechos del producto, en texto libre. El modelo solo usa lo que pongas aquí:
no inventa servicios, horarios ni precios.

- Ruta ficticia de 4 días por un valle de montaña y un río.
- Alojamiento en un albergue junto al río (2 noches) y en una casa rural (1 noche).
- Guía naturalista durante todo el recorrido; grupos de hasta 8 personas.
- Actividades: senderismo suave, observación de aves y paseo en barca.
- Incluye traslados terrestres, alojamiento, desayunos y comidas de los días 2 y 3.
- No incluye vuelos ni seguro de viaje.
- Mejor época: de mayo a octubre, con menos lluvias.
