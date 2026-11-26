# Requisitos — Ubuntu 22.04, 24.04 e 26.04 (amd64)

<!-- TOC -->

- [Requisitos — Ubuntu 22.04, 24.04 e 26.04 (amd64)](#requisitos--ubuntu-2204-2404-e-2604-amd64)
  - [Caminho automático (recomendado)](#caminho-automático-recomendado)
  - [Instalação manual (fontes oficiais)](#instalação-manual-fontes-oficiais)
    - [Pacotes básicos](#pacotes-básicos)
    - [Docker Engine e Compose v2](#docker-engine-e-compose-v2)
    - [mise (ferramentas de desenvolvimento)](#mise-ferramentas-de-desenvolvimento)
    - [Node.js (opcional, fora do mise)](#nodejs-opcional-fora-do-mise)
  - [Verificação](#verificação)

<!-- TOC -->

## Caminho automático (recomendado)

```bash
make check-os             # confirma Ubuntu suportado em amd64
make check-dependencies   # Docker, Compose, daemon, git, make, mise
make install              # instala mise em ~/.local/bin + ferramentas do .mise.toml + npm ci
```

`make install` **não** instala Docker nem usa `sudo`. Se faltar Docker, `make check-dependencies` mostra o link oficial.

## Instalação manual (fontes oficiais)

### Pacotes básicos

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git make
```

### Docker Engine e Compose v2

Guia oficial: <https://docs.docker.com/engine/install/ubuntu/> (repositório apt da Docker). Resumo do guia:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Usar Docker sem `sudo` (pós-instalação oficial: <https://docs.docker.com/engine/install/linux-postinstall/>):

```bash
sudo usermod -aG docker "$USER"   # depois saia e entre na sessão
docker run --rm hello-world
docker compose version            # precisa ser v2+
```

Compose: <https://docs.docker.com/compose/install/linux/>.

### mise (ferramentas de desenvolvimento)

Guia oficial: <https://mise.jdx.dev/getting-started.html>

```bash
curl https://mise.run | sh                 # instala em ~/.local/bin/mise
echo 'eval "$(~/.local/bin/mise activate bash)"' >> ~/.bashrc
cd desafio-catraca && mise trust && mise install
npm ci
```

### Node.js (opcional, fora do mise)

O avaliador já tem Node.js LTS; para desenvolver, prefira o mise. Fonte oficial: <https://nodejs.org/en/download>.

## Verificação

```bash
make check-dependencies && make up && make down
```
