// @ts-check
// Atualiza o campo Status do GitHub Projects conforme eventos do repositório (ver quadro.yml).

const STATUS = {
  backlog: 'Backlog',
  andamento: 'Em andamento',
  homologacao: 'Em homologação (dev)',
  concluido: 'Concluído (main)',
};

const PALAVRAS_DE_VINCULO = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;

/** @param {{ github: any, context: any, core: any }} args */
module.exports = async ({ github, context, core }) => {
  const projeto = await carregarProjeto(github);
  const { eventName, payload } = context;
  const { owner, repo } = context.repo;

  /** Coloca a issue no quadro (se ainda não estiver) e define o Status. */
  const moverIssue = async (/** @type {number} */ numero, /** @type {string} */ status) => {
    const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: numero });
    if (issue.pull_request) return;
    await definirStatus(github, projeto, issue.node_id, status);
    core.info(`#${numero} → ${status}`);
  };

  if (eventName === 'issues') {
    const { action, issue } = payload;
    if (action === 'opened' || action === 'reopened')
      await moverIssue(issue.number, STATUS.backlog);
    if (action === 'closed' && issue.state_reason === 'completed') {
      await moverIssue(issue.number, STATUS.concluido);
    }
    return;
  }

  if (eventName === 'create') {
    if (payload.ref_type !== 'branch') return;
    const numero = numeroDaBranch(payload.ref);
    if (numero) await moverIssue(numero, STATUS.andamento);
    return;
  }

  if (eventName === 'pull_request') {
    const pr = payload.pull_request;
    const numeros = issuesDoPr(pr);
    if (numeros.length === 0) {
      core.notice('PR sem "Closes #nº" nem branch feat/<nº>-…: nenhuma issue movida.');
      return;
    }
    const mesclado = payload.action === 'closed' && pr.merged;
    if (payload.action === 'closed' && !pr.merged) return;
    const status = mesclado ? STATUS.homologacao : STATUS.andamento;
    for (const numero of numeros) await moverIssue(numero, status);
    return;
  }

  if (eventName === 'push') {
    // Merge de dev em main: tudo que estava em homologação vai para produção.
    const itens = await itensDoProjeto(github, projeto.id);
    for (const item of itens) {
      const issue = item.content;
      if (!issue?.number || issue.repository?.nameWithOwner !== `${owner}/${repo}`) continue;
      if (item.status !== STATUS.homologacao) continue;
      await atualizarCampo(github, projeto, item.id, STATUS.concluido);
      if (issue.state === 'OPEN') {
        await github.rest.issues.update({
          owner,
          repo,
          issue_number: issue.number,
          state: 'closed',
          state_reason: 'completed',
        });
      }
      core.info(`#${issue.number} → ${STATUS.concluido}`);
    }
  }
};

/** feat/12-usuarios, fix/12-algo → 12 */
function numeroDaBranch(/** @type {string} */ ref) {
  const m = /^(?:feat|fix|chore)\/(\d+)(?:-|$)/.exec(ref);
  return m ? Number(m[1]) : null;
}

/** Issues citadas com Closes/Fixes/Resolves #nº no PR, mais o número da branch. */
function issuesDoPr(/** @type {any} */ pr) {
  const numeros = new Set();
  for (const m of `${pr.title}\n${pr.body ?? ''}`.matchAll(PALAVRAS_DE_VINCULO)) {
    numeros.add(Number(m[1]));
  }
  const daBranch = numeroDaBranch(pr.head.ref);
  if (daBranch) numeros.add(daBranch);
  return [...numeros];
}

async function carregarProjeto(/** @type {any} */ github) {
  const { user } = await github.graphql(
    `query($login: String!, $numero: Int!) {
      user(login: $login) {
        projectV2(number: $numero) {
          id
          field(name: "Status") {
            ... on ProjectV2SingleSelectField { id options { id name } }
          }
        }
      }
    }`,
    { login: process.env.PROJECT_OWNER, numero: Number(process.env.PROJECT_NUMBER) },
  );
  const projeto = user.projectV2;
  return {
    id: projeto.id,
    campoStatus: projeto.field.id,
    opcoes: Object.fromEntries(projeto.field.options.map((o) => [o.name, o.id])),
  };
}

async function definirStatus(github, projeto, idConteudo, status) {
  const { addProjectV2ItemById } = await github.graphql(
    `mutation($projeto: ID!, $conteudo: ID!) {
      addProjectV2ItemById(input: { projectId: $projeto, contentId: $conteudo }) { item { id } }
    }`,
    { projeto: projeto.id, conteudo: idConteudo },
  );
  await atualizarCampo(github, projeto, addProjectV2ItemById.item.id, status);
}

async function atualizarCampo(github, projeto, idItem, status) {
  const opcao = projeto.opcoes[status];
  if (!opcao) throw new Error(`Opção de Status "${status}" não existe no quadro.`);
  await github.graphql(
    `mutation($projeto: ID!, $item: ID!, $campo: ID!, $opcao: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projeto, itemId: $item, fieldId: $campo,
        value: { singleSelectOptionId: $opcao }
      }) { projectV2Item { id } }
    }`,
    { projeto: projeto.id, item: idItem, campo: projeto.campoStatus, opcao },
  );
}

async function itensDoProjeto(github, idProjeto) {
  const itens = [];
  let cursor = null;
  do {
    const { node } = await github.graphql(
      `query($id: ID!, $cursor: String) {
        node(id: $id) {
          ... on ProjectV2 {
            items(first: 100, after: $cursor) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue { name }
                }
                content {
                  ... on Issue { number state repository { nameWithOwner } }
                }
              }
            }
          }
        }
      }`,
      { id: idProjeto, cursor },
    );
    for (const n of node.items.nodes) {
      itens.push({ id: n.id, status: n.fieldValueByName?.name, content: n.content });
    }
    cursor = node.items.pageInfo.hasNextPage ? node.items.pageInfo.endCursor : null;
  } while (cursor);
  return itens;
}
