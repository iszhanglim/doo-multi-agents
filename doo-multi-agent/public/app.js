const healthCard = document.getElementById('healthCard');
const resultOutput = document.getElementById('resultOutput');
const portraitOutput = document.getElementById('portraitOutput');
const reportOutput = document.getElementById('reportOutput');
const childrenList = document.getElementById('childrenList');

const assessForm = document.getElementById('assessForm');
const scenarioForm = document.getElementById('scenarioForm');
const portraitIdInput = document.getElementById('portraitId');
const reportIdInput = document.getElementById('reportId');

function setHealth(text, tone = 'ok') {
  const dot = healthCard.querySelector('.dot');
  const strong = healthCard.querySelector('strong');
  strong.textContent = text;
  dot.style.background = tone === 'error' ? 'var(--danger)' : 'var(--accent-2)';
  dot.style.boxShadow = tone === 'error'
    ? '0 0 0 8px rgba(245, 149, 125, 0.14)'
    : '0 0 0 8px rgba(120, 216, 197, 0.12)';
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function formatResult(data) {
  return JSON.stringify(data, null, 2);
}

function fillForms(child) {
  assessForm.childId.value = child.childId;
  assessForm.childName.value = child.name;
  assessForm.classId.value = child.classId;

  scenarioForm.childId.value = child.childId;
  scenarioForm.childName.value = child.name;
  scenarioForm.classId.value = child.classId;

  portraitIdInput.value = child.childId;
  reportIdInput.value = child.childId;
}

function renderChildren(children) {
  if (!children.length) {
    childrenList.innerHTML = '<span class="chip">暂无画像数据</span>';
    return;
  }

  childrenList.innerHTML = '';
  children.forEach(child => {
    const button = document.createElement('button');
    button.className = 'chip';
    button.type = 'button';
    button.innerHTML = `<strong>${child.name}</strong> · ${child.childId} · ${child.latestLevel ?? '-'}级`;
    button.addEventListener('click', () => fillForms(child));
    childrenList.appendChild(button);
  });
}

async function loadHealth() {
  try {
    await request('/api/health');
    setHealth('服务正常');
  } catch (error) {
    setHealth('服务异常', 'error');
    resultOutput.textContent = String(error);
  }
}

async function loadChildren() {
  try {
    const data = await request('/api/children');
    renderChildren(data.children);
    if (data.children.length) {
      fillForms(data.children[0]);
    }
  } catch (error) {
    childrenList.innerHTML = `<span class="chip">${String(error)}</span>`;
  }
}

assessForm.addEventListener('submit', async event => {
  event.preventDefault();
  resultOutput.textContent = '评估中...';
  try {
    const payload = {
      childId: assessForm.childId.value,
      childName: assessForm.childName.value,
      classId: assessForm.classId.value,
      content: assessForm.content.value,
      scenario: 'smart_story_corner',
    };
    const data = await request('/api/assess', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    resultOutput.textContent = formatResult(data);
    portraitOutput.textContent = data.report || '暂无画像';
    reportOutput.textContent = data.radarChart || '暂无雷达图';
    await loadChildren();
  } catch (error) {
    resultOutput.textContent = String(error);
  }
});

scenarioForm.addEventListener('submit', async event => {
  event.preventDefault();
  resultOutput.textContent = '运行场景中...';
  try {
    const payload = {
      childId: scenarioForm.childId.value,
      childName: scenarioForm.childName.value,
      classId: scenarioForm.classId.value,
      scenario: scenarioForm.scenario.value,
      content: scenarioForm.content.value,
    };
    const data = await request('/api/scenario', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    resultOutput.textContent = formatResult(data);
    portraitOutput.textContent = data.report || '暂无画像';
    reportOutput.textContent = data.radarChart || '暂无雷达图';
    await loadChildren();
  } catch (error) {
    resultOutput.textContent = String(error);
  }
});

document.getElementById('loadPortrait').addEventListener('click', async () => {
  portraitOutput.textContent = '加载中...';
  try {
    const data = await request(`/api/portrait/${encodeURIComponent(portraitIdInput.value)}`);
    portraitOutput.textContent = data.report || formatResult(data);
    resultOutput.textContent = formatResult(data);
  } catch (error) {
    portraitOutput.textContent = String(error);
  }
});

document.getElementById('loadReport').addEventListener('click', async () => {
  reportOutput.textContent = '加载中...';
  try {
    const data = await request(`/api/report/${encodeURIComponent(reportIdInput.value)}`);
    reportOutput.textContent = data.report || '暂无报告';
  } catch (error) {
    reportOutput.textContent = String(error);
  }
});

document.getElementById('refreshChildren').addEventListener('click', loadChildren);

loadHealth();
loadChildren();
