FROM texlive/texlive:latest

# Cài Node.js 20 (để chạy server compile)
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server.js .

# === GÓI ex_test (bước 4b) ===
# Khi có file ex_test.sty, bỏ file vào thư mục ./texmf/tex/latex/ex_test/
# rồi mở 2 dòng dưới đây để cài:
# COPY texmf/ /usr/local/texlive/texmf-local/
# RUN texhash

EXPOSE 8080

CMD ["node", "server.js"]
