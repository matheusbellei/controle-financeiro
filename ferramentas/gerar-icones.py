"""Gera os ícones do app instalável (PWA) nas cores do app.
Uso: python3 ferramentas/gerar-icones.py  (cria icone-*.png na raiz do projeto)"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ESPRESSO, CARAMELO, CREME = '#3B2416', '#C68B59', '#F5EBDD'
FONTE = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
RAIZ = Path(__file__).resolve().parents[1]

def desenhar(tamanho, cantos_redondos, area_util=0.62):
    escala = 4  # desenha grande e reduz, para bordas suaves
    t = tamanho * escala
    img = Image.new('RGBA', (t, t), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if cantos_redondos:
        d.rounded_rectangle([0, 0, t - 1, t - 1], radius=int(t * 0.22), fill=ESPRESSO)
    else:
        d.rectangle([0, 0, t, t], fill=ESPRESSO)
    # moeda caramelo com "R$" no centro
    r = t * area_util / 2
    c = t / 2
    d.ellipse([c - r, c - r, c + r, c + r], fill=CARAMELO)
    d.ellipse([c - r * 0.84, c - r * 0.84, c + r * 0.84, c + r * 0.84], outline=CREME, width=max(2, int(t * 0.012)))
    fonte = ImageFont.truetype(FONTE, int(r * 0.95))
    d.text((c, c + r * 0.02), 'R$', font=fonte, fill=ESPRESSO, anchor='mm')
    return img.resize((tamanho, tamanho), Image.LANCZOS)

if __name__ == '__main__':
    desenhar(192, True).save(RAIZ / 'icone-192.png')
    desenhar(512, True).save(RAIZ / 'icone-512.png')
    # maskable: fundo até a borda e desenho dentro da área segura (o sistema recorta o formato)
    desenhar(512, False, area_util=0.5).save(RAIZ / 'icone-maskable-512.png')
    desenhar(180, False).save(RAIZ / 'icone-180.png')  # iPhone arredonda sozinho
    print('ícones gerados')
