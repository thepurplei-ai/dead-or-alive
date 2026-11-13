# Google Play — ready-to-paste texts and checklist

## Store listing (English)

**App name** (max 30): `Dead or Alive: Padel Ball Test`

**Short description** (max 80):
`Drop your padel ball. Your phone hears the bounces and says if it's still alive.`

**Full description:**

```
Is your padel ball still alive — or is it time to open a new can?

Drop the ball on a hard floor next to your phone. Dead or Alive listens to the bounces and tells you in seconds:

● ALIVE – great bounce, keep playing
● TIRED – fine for training, slower than a new ball
● DEAD – too slow for a good match

HOW IT WORKS
The time between bounces shows how fast the ball leaves the floor. The app measures every bounce, corrects for air drag and drop height, and converts the result into the bounce you'd get from the official 2.54 m drop test, where a new ball bounces 135–145 cm.

• Just the microphone – no extra equipment
• A ± range so you know how sure the reading is
• Calibrate once with a new ball for extra accuracy on your floor
• Works fully offline
• Private: sound is analysed on your phone and never saved or sent

Results are an estimate to help you decide when to change balls. Not affiliated with or endorsed by the FIP or any ball brand.
```

## Store listing (Español)

**Nombre** (máx. 30): `Dead or Alive – Test de pelota`

**Descripción breve** (máx. 80):
`Suelta tu pelota de pádel. El móvil escucha los botes y te dice si sigue viva.`

**Descripción completa:**

```
¿Tu pelota de pádel sigue viva… o toca abrir un bote nuevo?

Suelta la pelota sobre un suelo duro junto a tu móvil. Dead or Alive escucha los botes y te lo dice en segundos:

● VIVA – muy buen bote, sigue jugando
● CANSADA – sirve para entrenar, pero es más lenta
● MUERTA – demasiado lenta para un buen partido

CÓMO FUNCIONA
El tiempo entre botes indica a qué velocidad sale la pelota del suelo. La app mide cada bote, corrige la resistencia del aire y la altura de caída, y lo convierte en el bote que daría en la prueba oficial desde 2,54 m, donde una pelota nueva bota 135–145 cm.

• Solo el micrófono, sin accesorios
• Un margen ± para saber lo segura que es la medida
• Calibra una vez con una pelota nueva para más precisión en tu suelo
• Funciona sin conexión
• Privada: el sonido se analiza en tu móvil y nunca se guarda ni se envía

Los resultados son una estimación para ayudarte a decidir cuándo cambiar de pelotas. Sin relación ni aval de la FIP ni de ninguna marca de pelotas.
```

## Category and tags

- Category: **Sports**
- Tags: padel, tennis, ball, sports tools

## Graphics needed

- App icon 512×512 → made from `assets/icon.png`
- Feature graphic 1024×500 → `docs/feature-graphic.png`
- Phone screenshots (2–8) → take them on the phone, or use `docs/design-preview.png` screens

## Data safety form (answers)

- Does the app collect or share user data? **No**
- Microphone audio: processed only on the device, not collected (it never leaves the phone)
- Is data encrypted in transit? **Not applicable** (nothing is sent)
- Can users request deletion? **Not applicable** (no data collected; uninstalling removes the saved calibration)
- Privacy policy URL: host `docs/privacy-policy.md` (see below)

## Content rating

Fill in the questionnaire: no violence, no user content, no sharing, no ads → **Everyone / PEGI 3**.

## Checklist — things only the owner can do

1. Create a Google Play developer account ($25 once) and verify your identity.
2. Add your contact email to `docs/privacy-policy.md` (both languages) and publish it at a public web address.
3. Create the app in Play Console (name, default language, free).
4. Paste the texts above, upload graphics, fill in Data safety and Content rating.
5. Ask Claude to make the store build: `npx eas-cli@latest build --profile production --platform android`
   (this makes an .aab file for Google Play) and to upload it.
6. Start with **Internal testing**, then Closed testing. New personal accounts must run a closed test
   with at least 12 testers for 14 days before going to Production.

## Note for review

The app's Android permissions include `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
(added for the microphone library). The app only records while it is open, so if Play Console asks
about foreground services, these can be removed before the store build. Ask Claude to do it.
