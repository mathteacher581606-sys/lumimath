FROM texlive/texlive:latest

# Cài Node.js 20 (để chạy server compile)
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server.js .

# === GÓI ex_test + lumimath.sty (bộ gói dùng chung) ===
COPY texmf/ /usr/local/texlive/texmf-local/
RUN texhash

# === ĐỊNH DẠNG NẠP SẴN lmfmt.fmt ===
# Nạp toàn bộ gói của lumimath.sty MỘT LẦN lúc dựng image → mỗi lần biên dịch đoạn ngắn
# chỉ tải file định dạng (~0,3 giây thay vì ~2 giây). Dựng lỗi thì vẫn chạy được (server tự bỏ qua).
COPY fmt/ /opt/lmfmt/
RUN (cd /opt/lmfmt \
      && pdflatex -ini -interaction=nonstopmode -halt-on-error -jobname=lmfmt "&pdflatex" mylatexformat.ltx lmfmt.tex \
      && mkdir -p /usr/local/texlive/texmf-local/web2c/pdftex \
      && cp lmfmt.fmt /usr/local/texlive/texmf-local/web2c/pdftex/ \
      && texhash \
      && echo "lmfmt OK") \
    || echo "CẢNH BÁO: không dựng được lmfmt.fmt — biên dịch vẫn chạy nhưng chậm hơn"

# Trong container nghe mọi giao diện; docker-compose chỉ publish ra 127.0.0.1
ENV HOST=0.0.0.0
EXPOSE 8080

CMD ["node", "server.js"]
