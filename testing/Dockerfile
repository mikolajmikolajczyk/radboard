FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl git openssh-client xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Radicle (official install script, puts binaries in ~/.local/bin)
RUN curl -sSf https://radicle.xyz/install | sh

ENV PATH="/root/.radicle/bin:$PATH"
ENV RAD_HOME=/rad-home
ENV GIT_AUTHOR_NAME=tester
ENV GIT_AUTHOR_EMAIL=tester@radicle.xyz
ENV GIT_COMMITTER_NAME=tester
ENV GIT_COMMITTER_EMAIL=tester@radicle.xyz

COPY run.sh /usr/local/bin/run.sh
RUN chmod +x /usr/local/bin/run.sh

WORKDIR /workspace

CMD ["/usr/local/bin/run.sh"]
