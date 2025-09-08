<template>
  <div v-if="asPage || modelValue" :class="asPage ? '' : 'fixed inset-0 z-50 grid place-items-center bg-black/50'" @click.self="!asPage && $emit('update:modelValue', false)">
    <Transition :name="asPage ? '' : 'modal-zoom'" appear>
      <div :class="asPage ? 'relative w-full min-h-[60vh] bg-white dark:bg-zinc-900 overflow-hidden' : 'relative w-full sm:w-[960px] h-[85vh] rounded-lg bg-white shadow-lg dark:bg-zinc-900 overflow-hidden'" >
        <header v-if="!asPage" class="sticky top-0 z-10 mb-0 flex items-center justify-between border-b bg-white/80 p-3 backdrop-blur dark:bg-zinc-900/80">
          <h3 class="text-base font-semibold truncate">{{ localForm.nome_comercial || localForm.razao_social || 'Cliente' }}</h3>
          <button class="rounded p-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800" @click="$emit('update:modelValue', false)" aria-label="Fechar" title="Fechar">
            <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
          </button>
        </header>
        <!-- loading overlay -->
        <div v-if="localForm.__loading" class="absolute inset-0 z-20 grid place-items-center bg-white/60">
          <div class="flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm shadow"><span class="animate-spin">⏳</span> Salvando...</div>
        </div>

        <!-- Layout de 2 colunas: Tabs à esquerda e conteúdo à direita -->
        <div :class="asPage ? 'flex min-h-[60vh] relative' : 'flex h-[calc(85vh-56px)] relative'">
          <!-- Tabs verticais -->
          <aside class="w-56 shrink-0 border-r  p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
            <nav class="flex flex-col gap-1 text-sm">
              <button @click="tab='dados'" class="w-full text-left px-3 py-2 rounded-full flex items-center gap-2" :class="tab==='dados' ? 'bg-blue-600 text-white' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'">
                <Icon name="identification" class="h-4 w-4" /> <span>Dados Gerais</span>
              </button>
              <button @click="tab='contrato'" class="w-full text-left px-3 py-2 rounded-full flex items-center gap-2" :class="tab==='contrato' ? 'bg-blue-600 text-white' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'">
                <Icon name="document-text" class="h-4 w-4" /> <span>Contrato</span>
              </button>
              <button @click="tab='faturamento'" class="w-full text-left px-3 py-2 rounded-full flex items-center gap-2" :class="tab==='faturamento' ? 'bg-blue-600 text-white' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'">
                <Icon name="banknotes" class="h-4 w-4" /> <span>Faturamento</span>
              </button>
              <button @click="tab='locais'" class="w-full text-left px-3 py-2 rounded-full flex items-center gap-2" :class="tab==='locais' ? 'bg-blue-600 text-white' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'">
                <Icon name="map-pin" class="h-4 w-4" /> <span>Locais</span>
              </button>

              <button @click="tab='setores'" class="w-full text-left px-3 py-2 rounded-full flex items-center gap-2" :class="tab==='setores' ? 'bg-blue-600 text-white' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'">
                <Icon name="squares-2x2" class="h-4 w-4" /> <span>Setores</span>
              </button>
              <button @click="tab='funcoes'" class="w-full text-left px-3 py-2 rounded-full flex items-center gap-2" :class="tab==='funcoes' ? 'bg-blue-600 text-white' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'">
                <Icon name="wrench-screwdriver" class="h-4 w-4" /> <span>Funções</span>
              </button>
              <button @click="tab='usuarios'" class="w-full text-left px-3 py-2 rounded-full flex items-center gap-2" :class="tab==='usuarios' ? 'bg-blue-600 text-white' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'">
                <Icon name="users" class="h-4 w-4" /> <span>Usuários</span>
              </button>

              <button @click="tab='gestores'" class="w-full text-left px-3 py-2 rounded-full flex items-center gap-2" :class="tab==='gestores' ? 'bg-blue-600 text-white' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'">
                <Icon name="shield-check" class="h-4 w-4" /> <span>Gestores</span>
              </button>
            </nav>
          </aside>

          <!-- Conteúdo -->
          <main class="flex-1 overflow-y-auto relative">
            <div class="p-4">

      <!-- Aba 1: Dados Gerais -->
      <form v-if="tab==='dados'" class="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <div class="flex flex-col sm:col-span-3"><label class="form-label">Nome comercial*</label><input v-model="localForm.nome_comercial" class="form-input" required /></div>
        <div class="flex flex-col sm:col-span-3"><label class="form-label">Razão Social*</label><input v-model="localForm.razao_social" class="form-input" required /></div>
        <div class="flex flex-col sm:col-span-2"><label class="form-label">CNPJ*</label><input v-model="localForm.cnpj" class="form-input" inputmode="numeric" placeholder="00.000.000/0000-00" @input="maskCNPJ" required /></div>
        <div class="flex flex-col sm:col-span-2"><label class="form-label">E-mail*</label><input v-model="localForm.email" type="email" class="form-input" required /></div>
        <div class="flex flex-col sm:col-span-2"><label class="form-label">Domínio da empresa</label><input v-model="localForm.dominio" class="form-input" placeholder="ex.: empresa.com.br" /></div>

        <div class="flex flex-col sm:col-span-2"><label class="form-label">Telefone 1</label><input v-model="localForm.telefone1" class="form-input" inputmode="numeric" placeholder="(00) 00000-0000" @input="maskPhone('telefone1')" /></div>
        <div class="flex flex-col sm:col-span-2"><label class="form-label">Telefone 2</label><input v-model="localForm.telefone2" class="form-input" inputmode="numeric" placeholder="(00) 00000-0000" @input="maskPhone('telefone2')" /></div>
        <div class="flex flex-col sm:col-span-2"><label class="form-label">Status</label>
          <select v-model="localForm.active" class="form-input">
            <option :value="1">Ativo</option>
            <option :value="0">Inativo</option>
          </select>
        </div>

        <!-- Endereço removido daqui: vai para Locais -->


        <!-- <label class="switch sm:col-span-3"><input type="checkbox" v-model="localForm.tributado_sp" /> <span>Tributado em São Paulo?</span></label> -->



        <div class="sm:col-span-6 flex justify-end gap-2 pt-3 border-t mt-2">
          <button type="button" class="rounded-full  px-4 py-1 h-[28px]  text-sm font-semibold text-dark shadow-sm hover:bg-gray-300" @click="$emit('update:modelValue', false)">Cancelar</button>
          <button type="button" class="rounded-full bg-blue-600 px-4 py-1 h-[28px]  text-sm font-semibold text-white shadow-sm hover:bg-blue-600" @click="onSave">Salvar</button>
        </div>
      </form>


      <!-- Aba: Contrato -->
      <form v-else-if="tab==='contrato'" class="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <div class="flex flex-col sm:col-span-4"><label class="form-label">Contrato</label><input v-model="localForm.contrato" class="form-input" /></div>
        <div class="flex flex-col sm:col-span-1"><label class="form-label">Início do Contrato</label><input v-model="localForm.contrato_inicio" class="form-input" placeholder="DD/MM/AAAA" @input="maskDate('contrato_inicio')" /></div>
        <div class="flex flex-col sm:col-span-1"><label class="form-label">Fim do Contrato</label><input v-model="localForm.contrato_fim" class="form-input" placeholder="DD/MM/AAAA" @input="maskDate('contrato_fim')" /></div>
        <div class="sm:col-span-6 flex justify-end gap-2 pt-3 border-t mt-2">
          <button type="button" class="rounded-full  px-4 py-1 h-[28px]  text-sm font-semibold text-dark shadow-sm hover:bg-gray-300" @click="$emit('update:modelValue', false)">Cancelar</button>
          <button type="button" class="rounded-full bg-blue-600 px-4 py-1 h-[28px]  text-sm font-semibold text-white shadow-sm hover:bg-blue-600" @click="onSave">Salvar</button>
        </div>
      </form>

      <!-- Aba: Faturamento -->
      <form v-else-if="tab==='faturamento'" class="space-y-2 relative">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-medium">Faturamento</h4>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div class="flex flex-col sm:col-span-2"><label class="form-label">Faturamento</label><input v-model="localForm.faturamento" class="form-input" /></div>
        <div class="flex flex-col sm:col-span-2"><label class="form-label">Meio de recebimento</label>
          <select v-model="localForm.meio_recebimento" class="form-input">
            <option value="">Selecione</option>
            <option value="DEPÓSITO">DEPÓSITO</option>
            <option value="BOLETO">BOLETO</option>
          </select>
        </div>
        <label class="switch sm:col-span-2"><input type="checkbox" v-model="localForm.simples_nacional" /> <span>Optante do Simples Nacional?</span></label>
        <div class="flex flex-col sm:col-span-2"><label class="form-label">Lista de presença</label>
          <select v-model="localForm.lista_presenca" class="form-input">
            <option value="">Selecione</option>
            <option value="Com foto">Com foto</option>
            <option value="Sem foto">Sem foto</option>
          </select>
        </div>
        <div class="flex flex-col sm:col-span-3"><label class="form-label">Situação Tributária</label>
          <select v-model="localForm.situacao_tributaria" class="form-input">
            <option value="">Selecione</option>
            <option v-for="opt in taxSituationOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div class="flex flex-col sm:col-span-6"><label class="form-label">Orientações para o faturamento</label><textarea v-model="localForm.orientacoes_faturamento" class="form-textarea" placeholder="Sem foto"></textarea></div>
        <div class="sm:col-span-6 flex justify-end gap-2 pt-3 border-t mt-2">
          <button type="button" class="rounded-full  px-4 py-1 h-[28px]  text-sm font-semibold text-dark shadow-sm hover:bg-gray-300" @click="$emit('update:modelValue', false)">Cancelar</button>
          <button type="button" class="rounded-full bg-blue-600 px-4 py-1 h-[28px]  text-sm font-semibold text-white shadow-sm hover:bg-blue-600" @click="onSave">Salvar</button>
        </div>
        </div>

      </form>

      <!-- Continua Locais -->
      <div v-else-if="tab==='locais'" class="space-y-2 relative">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-medium">Locais</h4>
          <button class="rounded-full bg-[#0B61F3] px-3 py-1 text-sm font-semibold text-white shadow-sm hover:bg-blue-600" @click="openLocalDrawer()">Adicionar</button>
        </div>

        <div v-if="!(localForm.locais && localForm.locais.length)" class="rounded border border-dashed p-6 text-center text-sm text-zinc-500">Nenhum local adicionado ainda.</div>

        <!-- Cards de locais -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <article v-for="(lc,i) in localForm.locais || []" :key="'lc'+i" class="relative rounded border p-3 shadow-sm">
            <header class="mb-2 flex items-center justify-between">
              <div class="min-w-0 flex flex-wrap items-center gap-2">
                <span v-if="lc.qrcode_fixo" class="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">QR Fixo</span>
                <span v-if="lc.regiao" class="rounded border px-1.5 py-0.5 text-[10px] text-zinc-600">{{ lc.regiao }}</span>
                <span v-if="lc.uf" class="rounded border px-1.5 py-0.5 text-[10px] text-zinc-600">{{ lc.uf }}</span>
              </div>
              <div class="relative">
                <button class="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Mais ações" @click="toggleLocalMenu(i)">⋯</button>
                <div v-if="openLocalMenuIndex===i" class="absolute right-0 mt-1 w-36 rounded-md border bg-white p-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900 z-10">
                  <button class="block w-full rounded px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="onEditLocal(i)">Editar</button>
                  <!-- <button class="block w-full rounded px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="onDuplicateLocal(i)">Duplicar</button> -->
                  <button class="block w-full rounded px-2 py-1 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50" @click="onRemoveLocal(i)">Excluir</button>
                </div>
              </div>
            </header>
            <dl class="text-xs text-zinc-600 space-y-1">
              <div class="flex justify-between text-sm font-medium "><dd>{{ lc.nome }}</dd></div>
              <div class="flex justify-between"><dd>{{ lc.responsavel }} - {{ lc.telefone }}</dd></div>
              <div class="flex justify-between"><dd>{{ lc.endereco }}, {{lc.numero }}</dd></div>
              <div class="flex justify-between"><dd>{{lc.bairro }} - {{ lc.cidade}} / {{lc.uf }} - CEP: {{ lc.cep }}</dd></div>
            </dl>

          </article>
        </div>


      </div>


      <div v-else-if="tab==='setores'" class="space-y-2">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-medium">Setores</h4>
          <button class="rounded-full bg-[#0B61F3] px-3 py-1 text-sm font-semibold text-white shadow-sm hover:bg-blue-600" @click="openSetorDrawer()">Adicionar</button>
        </div>
        <div v-if="!(localForm.setores && localForm.setores.length)" class="rounded border border-dashed p-6 text-center text-sm text-zinc-500">Nenhum setor cadastrado.</div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <article v-for="(st,i) in localForm.setores || []" :key="'st'+i" class="rounded border p-3 shadow-sm">
            <header class="mb-2 flex items-center justify-between">
              <div class="min-w-0 flex flex-wrap items-center gap-2">
                <strong class="text-sm truncate">{{ st.setor || ('Setor #' + (i+1)) }}</strong>
                <span v-if="st.local_id" class="rounded border px-1.5 py-0.5 text-[10px] text-zinc-600">{{ localLabel(st.local_id) }}</span>
              </div>
              <div class="relative">
                <button class="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Mais ações" @click="toggleSetorMenu(i)">⋯</button>
                <div v-if="openSetorMenuIndex===i" class="absolute right-0 mt-1 w-36 rounded-md border bg-white p-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900 z-10">
                  <button class="block w-full rounded px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="onEditSetor(i)">Editar</button>
                  <button class="block w-full rounded px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="onDuplicateSetor(i)">Duplicar</button>
                  <button class="block w-full rounded px-2 py-1 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50" @click="onRemoveSetor(i)">Excluir</button>
                </div>
              </div>
            </header>
            <div v-if="setorEditIndex===i" class="space-y-2">
              <div class="flex items-center gap-2">
                <label class="text-xs w-16">Local</label>
                <select v-model="st.local_id" class="form-input w-full" @change="preloadSetoresFor(st.local_id)">
                  <option value="">Selecione...</option>
                  <option v-for="opt in localOptions" :key="'lo'+opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
              <div class="flex items-center gap-2">
                <label class="text-xs w-16">Setor</label>
                <select v-model="st.setor" class="form-input w-full">
                  <option value="">Selecione...</option>
                  <option v-if="isSetorLoading(st.local_id)" disabled>carregando...</option>
                  <option v-else-if="getSetorOptions(st.local_id).length===0" disabled>sem opções</option>
                  <option v-for="opt in getSetorOptions(st.local_id)" :key="'st'+opt.value" :value="opt.label">{{ opt.label }}</option>
                </select>
              </div>
              <div class="flex justify-end gap-2">
                <button class="btn btn-xs" @click="setorEditIndex=-1">Cancelar</button>
                <button class="btn btn-primary btn-xs" @click="setorEditIndex=-1">Salvar</button>
              </div>
            </div>
            <dl v-else class="text-xs text-zinc-600 space-y-1">
              <div class="flex justify-between"><dt class="font-medium">Local</dt><dd>{{ localLabel(st.local_id) || '-' }}</dd></div>
              <div class="flex justify-between"><dt class="font-medium">Setor</dt><dd>{{ st.setor || '-' }}</dd></div>
            </dl>
          </article>
        </div>
      </div>

      <div v-else-if="tab==='funcoes'" class="space-y-2">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-medium">Funções</h4>
          <button class="rounded-full bg-[#0B61F3] px-3 py-1 text-sm font-semibold text-white shadow-sm hover:bg-blue-600" @click="openFuncDrawer()">Adicionar</button>
        </div>

        <div v-if="!(localForm.funcoes && localForm.funcoes.length)" class="rounded border border-dashed p-6 text-center text-sm text-zinc-500">Nenhuma função cadastrada.</div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <article v-for="(fn,i) in localForm.funcoes || []" :key="'fn'+i" class="rounded border p-3 shadow-sm">
            <header class="mb-2 flex items-center justify-between">
              <div class="min-w-0 flex flex-wrap items-center gap-2">
                <strong class="text-sm truncate">{{ fn.funcao || ('Função #' + (i+1)) }}</strong>
                <span v-if="fn.setor" class="rounded border px-1.5 py-0.5 text-[10px] text-zinc-600">{{ fn.setor }}</span>
                <span v-if="fn.local_id" class="rounded border px-1.5 py-0.5 text-[10px] text-zinc-600">{{ localLabel(fn.local_id) }}</span>
              </div>
              <div class="relative">
                <button class="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Mais ações" @click="toggleFuncMenu(i)">⋯</button>
                <div v-if="openFuncMenuIndex===i" class="absolute right-0 mt-1 w-36 rounded-md border bg-white p-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900 z-10">
                  <button class="block w-full rounded px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="onEditFunc(i)">Editar</button>
                  <button class="block w-full rounded px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="onDuplicateFunc(i)">Duplicar</button>
                  <button class="block w-full rounded px-2 py-1 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50" @click="onRemoveFunc(i)">Excluir</button>
                </div>
              </div>
            </header>
            <div v-if="funcEditIndex===i" class="grid grid-cols-1 gap-2">
              <div class="flex items-center gap-2">
                <label class="text-xs w-16">Local</label>
                <select v-model="fn.local_id" class="form-input w-full" @change="preloadSetoresFor(fn.local_id)">
                  <option value="">Selecione um local...</option>
                  <option v-for="opt in localOptions" :key="'lo'+opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
              <div class="flex items-center gap-2">
                <label class="text-xs w-16">Setor</label>
                <select v-model="fn.setor" class="form-input w-full">
                  <option value="">Selecione um setor...</option>
                  <option v-for="opt in getSetorOptions(fn.local_id)" :key="'st'+(opt.value ?? opt.id ?? opt.text ?? opt.setor)" :value="opt.text ?? opt.label ?? opt.nome ?? opt.setor">{{ opt.text ?? opt.label ?? opt.nome ?? opt.setor }}</option>
                </select>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select v-model="fn.atividade" class="form-input">
                  <option value="">Selecione uma atividade...</option>
                  <option v-for="opt in atividadesOptions" :key="'atv'+opt.value" :value="opt.text">{{ opt.text }}</option>
                </select>

                <input v-model="fn.funcao" placeholder="Função" class="form-input" />
                <input v-model="fn.medida" placeholder="Medida (ex: hora, dia, mês)" class="form-input" />
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input v-model="fn.normal" placeholder="Normal" class="form-input" />
                <input v-model="fn.extra" placeholder="Extra" class="form-input" />
                <input v-model="fn.noturno" placeholder="Noturno" class="form-input" />
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input v-model="fn.extra_noturno" placeholder="Extra Noturno" class="form-input" />
                <input v-model="fn.normal_cliente" placeholder="Normal Cliente" class="form-input" />
                <input v-model="fn.extra_cliente" placeholder="Extra Cliente" class="form-input" />
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input v-model="fn.noturno_cliente" placeholder="Noturno Cliente" class="form-input" />
                <input v-model="fn.extra_noturno_cliente" placeholder="Extra Noturno Cliente" class="form-input" />
                <input v-model="fn.carga" placeholder="Carga (ex: 220h/mês)" class="form-input" />
              </div>
              <div class="flex justify-end gap-2">
                <button class="btn btn-xs" @click="funcEditIndex=-1">Cancelar</button>
                <button class="btn btn-primary btn-xs" @click="funcEditIndex=-1">Salvar</button>
              </div>
            </div>
            <dl v-else class="text-xs text-zinc-600 space-y-1">
              <div class="flex justify-between"><dt class="font-medium">Local</dt><dd>{{ localLabel(fn.local_id) || '-' }}</dd></div>
              <div class="flex justify-between"><dt class="font-medium">Setor</dt><dd>{{ fn.setor || '-' }}</dd></div>
              <div class="flex justify-between"><dt class="font-medium">Atividade</dt><dd class="truncate max-w-[12rem]">{{ fn.atividade || '-' }}</dd></div>
              <div class="flex justify-between"><dt class="font-medium">Função</dt><dd>{{ fn.funcao || '-' }}</dd></div>
              <div class="flex justify-between"><dt class="font-medium">Medida</dt><dd>{{ fn.medida || '-' }}</dd></div>
              <div class="flex justify-between"><dt class="font-medium">Cargas/Valores</dt><dd class="truncate max-w-[12rem]">N: {{ fn.normal || '-' }} • E: {{ fn.extra || '-' }} • Nt: {{ fn.noturno || '-' }}</dd></div>
            </dl>
          </article>
        </div>
        </div>



      <div v-else-if="tab==='usuarios'" class="space-y-2">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-medium">Usuários</h4>
          <button class="rounded-full bg-[#0B61F3] px-3 py-1 text-sm font-semibold text-white shadow-sm hover:bg-blue-600" @click="addUser">Adicionar</button>
        </div>

        <div v-if="!(localForm.usuarios && localForm.usuarios.length)" class="rounded border border-dashed p-6 text-center text-sm text-zinc-500">Nenhum usuário cadastrado.</div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <article v-for="(us,i) in localForm.usuarios || []" :key="'us'+i" class="rounded border p-3 shadow-sm">
            <header class="mb-2 flex items-center justify-between">
              <div class="min-w-0 flex flex-wrap items-center gap-2">
                <strong class="text-sm truncate">{{ us.usuario || ('Usuário #' + (i+1)) }}</strong>
                <span v-if="us.perfil" class="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">{{ us.perfil }}</span>
              </div>
              <div class="relative">
                <button class="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Mais ações" @click="toggleUserMenu(i)">⋯</button>
                <div v-if="openUserMenuIndex===i" class="absolute right-0 mt-1 w-36 rounded-md border bg-white p-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900 z-10">
                  <button class="block w-full rounded px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="onEditUser(i)">Editar</button>
                  <button class="block w_full rounded px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="onDuplicateUser(i)">Duplicar</button>
                  <button class="block w-full rounded px-2 py-1 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50" @click="onRemoveUser(i)">Excluir</button>
                </div>
              </div>
            </header>
            <div v-if="false" class="space-y-2">
              <!-- Edição inline desativada; edição via sidebar -->
            </div>
            <dl v-else class="text-xs text-zinc-600 space-y-1">
              <div class="flex justify-between"><dt class="font-medium">E-mail</dt><dd class="truncate max-w-[12rem]">{{ us.email || '-' }}</dd></div>
              <div class="flex justify-between"><dt class="font-medium">Perfil</dt><dd>{{ us.perfil || '-' }}</dd></div>
              <div class="flex justify-between"><dt class="font-medium">Unidades</dt><dd class="truncate max-w-[12rem]">{{ us.unidades_liberadas || '-' }}</dd></div>
            </dl>
          </article>
        </div>
      </div>

        <!-- Sidebar Usuários: asPage => overlay direita; modal => aside interno -->
        <Transition name="slide-right" appear>
          <div v-if="userDrawerOpen && asPage" class="fixed inset-0 z-50">
            <div class="absolute inset-0 bg-black/40" @click="closeUserDrawer" />
            <aside class="absolute right-0 top-0 h-full w-full sm:w-[480px] lg:w-[640px] bg-white dark:bg-zinc-900 border-l shadow-xl flex flex-col">
              <div class="flex items-center justify-between p-3 border-b sticky top-0 bg-white/95 dark:bg-zinc-900/95 z-10">
                <h5 class="text-base font-semibold truncate">{{ userEditIndex === -1 ? 'Novo usuário' : 'Editar usuário' }}</h5>
                <button class="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="closeUserDrawer" aria-label="Fechar">✕</button>
              </div>

              <div class="p-4 space-y-3 overflow-y-auto">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="text-xs">Nome *</label>
                    <input v-model="userDraft.usuario" placeholder="Nome" class="form-input w-full" />
                  </div>
                  <div>
                    <label class="text-xs">Email *</label>
                    <input v-model="userDraft.email" placeholder="Email" class="form-input w-full" />
                  </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="text-xs">Unidades de acesso</label>
                    <select v-model="userDraft.unidades_liberadas" class="form-input w-full" multiple>
                      <option v-for="opt in localOptions" :key="'lo'+opt.value" :value="opt.label">{{ opt.label }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="text-xs">Perfil do usuário</label>
                    <div class="flex gap-4 mt-1">
                      <label class="inline-flex items-center gap-2">
                        <input type="radio" value="ADMIN" v-model="userDraft.perfil" />
                        <span>Administrativo</span>
                      </label>
                      <label class="inline-flex items-center gap-2">
                        <input type="radio" value="PADRAO" v-model="userDraft.perfil" />
                        <span>Padrão</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div class="mt-auto p-3 border-t bg-white dark:bg-zinc-900">
                <div class="flex justify-end gap-2">
                  <button class="btn btn-secondary btn-sm" @click="closeUserDrawer">Cancelar</button>
                  <button class="btn btn-primary btn-sm" @click="saveUserDraft">Salvar</button>
                </div>
              </div>
            </aside>
          </div>
          <aside v-else-if="userDrawerOpen" class="absolute inset-y-0 right-0 z-40 w-[420px] max-w-[60%] bg-gray-100 dark:bg-zinc-900 border-l shadow-xl flex flex-col">
            <div class="flex items-center justify-between p-2 border-b sticky top-0 bg-white/95 dark:bg-zinc-900/95 z-10">
              <h5 class="text-sm font-semibold truncate">{{ userEditIndex === -1 ? 'Novo usuário' : 'Editar usuário' }}</h5>
              <button class="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="closeUserDrawer" aria-label="Fechar">✕</button>
            </div>

            <div class="p-3 space-y-2 overflow-y-auto">
              <label class="text-xs">Nome *</label>
              <input v-model="userDraft.usuario" placeholder="Nome" class="form-input w-full" />
              <label class="text-xs">Email *</label>
              <input v-model="userDraft.email" placeholder="Email" class="form-input w-full" />
              <label class="text-xs">Unidades de acesso</label>
              <select v-model="userDraft.unidades_liberadas" class="form-input w-full" multiple>
                <option v-for="opt in localOptions" :key="'lo'+opt.value" :value="opt.label">{{ opt.label }}</option>
              </select>
              <label class="text-xs">Perfil do usuário</label>
              <div class="flex gap-4 mt-1">
                <label class="inline-flex items-center gap-2">
                  <input type="radio" value="ADMIN" v-model="userDraft.perfil" />
                  <span>Administrativo</span>
                </label>
                <label class="inline-flex items-center gap-2">
                  <input type="radio" value="PADRAO" v-model="userDraft.perfil" />
                  <span>Padrão</span>
                </label>
              </div>
            </div>

            <div class="mt-auto p-3 border-t bg-white dark:bg-zinc-900">
              <div class="flex justify-end gap-2">
                <button class="btn btn-secondary btn-sm" @click="closeUserDrawer">Cancelar</button>
                <button class="btn btn-primary btn-sm" @click="saveUserDraft">Salvar</button>
              </div>
            </div>
          </aside>
        </Transition>


      <div v-if="tab==='gestores'" class="space-y-2">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-medium">Gestores</h4>
          <button class="rounded-full bg-[#0B61F3] px-3 py-1 text-sm font-semibold text-white shadow-sm hover:bg-blue-600" @click="addRow('gestores', { local:'', setor:'', atividade:'', gestor:'', periodo_dia:'', periodo_mes:'' })">Adicionar</button>
        </div>

        <div v-if="!(localForm.gestores && localForm.gestores.length)" class="rounded border border-dashed p-6 text-center text-sm text-zinc-500">Nenhum gestor cadastrado.</div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <article v-for="(gs,i) in localForm.gestores || []" :key="'gs'+i" class="rounded border p-3 shadow-sm">
            <header class="mb-2 flex items-center justify-between">
              <div class="min-w-0 flex flex-wrap items-center gap-2">
                <strong class="text-sm truncate">{{ textLabel(gs.gestor) || ('Gestor #' + (i+1)) }}</strong>
                <span v-if="gs.local" class="rounded border px-1.5 py-0.5 text-[10px] text-zinc-600">{{ typeof gs.local==='number' ? localLabel(gs.local) : textLabel(gs.local) }}</span>
                <span v-if="gs.setor" class="rounded border px-1.5 py-0.5 text-[10px] text-zinc-600">{{ textLabel(gs.setor) }}</span>
              </div>
              <div class="relative">
                <button class="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Mais ações" @click="toggleGestorMenu(i)">⋯</button>
                <div v-if="openGestorMenuIndex===i" class="absolute right-0 mt-1 w-36 rounded-md border bg-white p-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900 z-10">
                  <button class="block w-full rounded px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="onEditGestor(i)">Editar</button>
                  <button class="block w-full rounded px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="onDuplicateGestor(i)">Duplicar</button>
                  <button class="block w-full rounded px-2 py-1 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50" @click="onRemoveGestor(i)">Excluir</button>
                </div>
              </div>
            </header>
            <div v-if="gestorEditIndex===i" class="space-y-2">
              <input v-model="gs.local" placeholder="Local*" class="form-input w-full" />
              <input v-model="gs.setor" placeholder="Setor*" class="form-input w-full" />
              <input v-model="gs.atividade" placeholder="Atividade" class="form-input w-full" />
              <input v-model="gs.gestor" placeholder="Gestor (Nome)" class="form-input w-full" />
              <div class="grid grid-cols-2 gap-2">
                <input v-model="gs.periodo_dia" placeholder="Período Dia" class="form-input" />
                <input v-model="gs.periodo_mes" placeholder="Período Mês" class="form-input" />
              </div>
              <div class="flex justify-end gap-2">
                <button class="btn btn-xs" @click="gestorEditIndex=-1">Cancelar</button>
                <button class="btn btn-primary btn-xs" @click="gestorEditIndex=-1">Salvar</button>
              </div>
            </div>
            <dl v-else class="text-xs text-zinc-600 space-y-1">
              <div class="flex justify-between"><dt class="font-medium">Local</dt><dd>{{ gs.local || '-' }}</dd></div>
              <div class="flex justify-between"><dt class="font-medium">Setor</dt><dd>{{ gs.setor || '-' }}</dd></div>




              <div class="flex justify-between"><dt class="font-medium">Atividade</dt><dd class="truncate max-w-[12rem]">{{ gs.atividade || '-' }}</dd></div>
              <div class="flex justify-between"><dt class="font-medium">Período</dt><dd>{{ gs.periodo_dia || '-' }} / {{ gs.periodo_mes || '-' }}</dd></div>
            </dl>
          </article>
        </div>
      </div>



            </div>
          </main>

          <!-- Aside Locais: asPage => overlay lateral direita; modal => aside interno à direita -->
          <Transition name="slide-right" appear>
            <div v-if="localDrawerOpen && asPage" class="fixed inset-0 z-50">
              <div class="absolute inset-0 bg-black/40" @click="closeLocalDrawer" />
              <aside class="absolute right-0 top-0 h-full w-full sm:w-[420px] lg:w-[560px] bg-white dark:bg-zinc-900 shadow-xl flex flex-col">
                <div class="flex items-center justify-between p-6 pb-0 sticky top-0 bg-white/95 dark:bg-zinc-900/95 z-10">
                  <h4 class="text-base font-semibold truncate">{{ localEditIndex === -1 ? 'Novo local' : 'Editar local' }}</h4>
                  <button class="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="closeLocalDrawer" aria-label="Fechar">✕</button>
                </div>

                <div class="p-6 space-y-3 overflow-y-auto">
                  <input v-model="localDraft.nome" placeholder="Nome da unidade*" class="form-input w-full" />
                  <input v-model="localDraft.responsavel" placeholder="Responsável*" class="form-input w-full" />

                  <div class="grid grid-cols-2 gap-2">
                    <input v-model="localDraft.telefone" placeholder="Telefone" class="form-input" @input="maskPhoneDraft" />
                    <input v-model="localDraft.email" type="email" placeholder="Email" class="form-input" />
                  </div>

                  <div class="grid grid-cols-[1fr_auto] gap-2 items-center">
                    <div class="relative">
                      <input v-model="localDraft.cep" placeholder="CEP" class="form-input w-full pr-7 text-sm" @input="localDraft.cep = (localDraft.cep||'').replace(/[^0-9]/g,'').slice(0,8).replace(/(\\d{5})(\\d{0,3})/, '$1-$2')" @keyup.enter="fetchViaCepDraft" @blur="fetchViaCepDraft" />
                      <span class="absolute right-1.5 top-1.5 text-zinc-500 cursor-pointer" title="Buscar CEP" @click="fetchViaCepDraft">
                        <Icon name="magnifying-glass" class="h-4 w-4" />
                      </span>
                    </div>
                  </div>

                  <input v-model="localDraft.endereco" placeholder="Endereço" class="form-input w-full" />
                  <div class="grid grid-cols-6 gap-2">
                    <input v-model="localDraft.bairro" placeholder="Bairro" class="form-input col-span-3" />
                    <input v-model="localDraft.cidade" placeholder="Cidade" class="form-input col-span-2" />
                    <input v-model="localDraft.uf" placeholder="UF" maxlength="2" class="form-input col-span-1 text-center" />
                  </div>

                  <div class="grid grid-cols-2 gap-2">
                    <input v-model="localDraft.numero" placeholder="Número" class="form-input" />
                    <input v-model="localDraft.complemento" placeholder="Complemento" class="form-input" />
                  </div>

                  <div class="flex items-center justify-between py-1">
                    <span class="text-sm">QR Code Fixo</span>
                    <button type="button" class="relative inline-flex h-5 w-9 items-center rounded-full" :class="localDraft.qrcode_fixo ? 'bg-brand-600' : 'bg-zinc-300'" @click="localDraft.qrcode_fixo = !localDraft.qrcode_fixo">
                      <span class="sr-only">Alternar QR Code Fixo</span>
                      <span class="inline-block h-4 w-4 transform rounded-full bg-white transition" :class="localDraft.qrcode_fixo ? 'translate-x-5' : 'translate-x-1'" />
                    </button>
                  </div>
                </div>

                <div class="mt-auto p-3 border-t bg-white dark:bg-zinc-900">
                  <div class="flex justify-end gap-2">
                    <button class="btn btn-secondary btn-sm" @click="closeLocalDrawer">Cancelar</button>
                    <button class="btn btn-primary btn-sm" @click="saveLocalDraft">Salvar</button>
                  </div>
                </div>
              </aside>
            </div>
            <aside v-else-if="localDrawerOpen" class="absolute inset-y-0 right-0 z-40 w-[350px] max-w-[60%] bg-gray-100 dark:bg-zinc-900 border-l shadow-xl flex flex-col">
              <div class="flex items-center justify-between p-2 border-b sticky top-0 bg-white/95 dark:bg-zinc-900/95 z-10">
                <h5 class="text-sm font-semibold truncate">{{ localEditIndex === -1 ? 'Novo local' : 'Editar local' }}</h5>
                <button class="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="closeLocalDrawer" aria-label="Fechar">✕</button>
              </div>

              <div class="p-3 space-y-2 overflow-y-auto">
                <input v-model="localDraft.nome" placeholder="Nome da unidade*" class="form-input w-full" />
                <input v-model="localDraft.responsavel" placeholder="Responsável*" class="form-input w-full" />

                <div class="grid grid-cols-2 gap-2">
                  <input v-model="localDraft.telefone" placeholder="Telefone" class="form-input" @input="maskPhoneDraft" />
                  <input v-model="localDraft.email" type="email" placeholder="Email" class="form-input" />
                  <div></div>
                </div>

                <div class="grid grid-cols-[1fr_auto] gap-2 items-center">
                  <div class="relative">
                    <input v-model="localDraft.cep" placeholder="CEP" class="form-input w-full pr-7 text-sm" @input="localDraft.cep = (localDraft.cep||'').replace(/[^0-9]/g,'').slice(0,8).replace(/(\\d{5})(\\d{0,3})/, '$1-$2')" @keyup.enter="fetchViaCepDraft" @blur="fetchViaCepDraft" />
                    <span class="absolute right-1.5 top-1.5 text-zinc-500 cursor-pointer" title="Buscar CEP" @click="fetchViaCepDraft">
                      <Icon name="magnifying-glass" class="h-4 w-4" />
                    </span>
                  </div>
                </div>

                <input v-model="localDraft.endereco" placeholder="Endereço" class="form-input w-full" />
                <div class="grid grid-cols-6 gap-2">
                  <input v-model="localDraft.bairro" placeholder="Bairro" class="form-input col-span-3" />
                  <input v-model="localDraft.cidade" placeholder="Cidade" class="form-input col-span-2" />
                  <input v-model="localDraft.uf" placeholder="UF" maxlength="2" class="form-input col-span-1 text-center" />
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <input v-model="localDraft.numero" placeholder="Número" class="form-input" />
                  <input v-model="localDraft.complemento" placeholder="Complemento" class="form-input" />
                </div>

                <div class="flex items-center justify-between py-1">
                  <span class="text-sm">QR Code Fixo</span>
                  <button type="button" class="relative inline-flex h-5 w-9 items-center rounded-full" :class="localDraft.qrcode_fixo ? 'bg-brand-600' : 'bg-zinc-300'" @click="localDraft.qrcode_fixo = !localDraft.qrcode_fixo">
                    <span class="sr-only">Alternar QR Code Fixo</span>
                    <span class="inline-block h-4 w-4 transform rounded-full bg-white transition" :class="localDraft.qrcode_fixo ? 'translate-x-5' : 'translate-x-1'" />
                  </button>
                </div>

              </div>

              <div class="mt-auto p-3 border-t bg-white dark:bg-zinc-900">
                <div class="flex justify-end gap-2">
                  <button class="btn btn-secondary btn-sm" @click="closeLocalDrawer">Cancelar</button>
                  <button class="btn btn-primary btn-sm" @click="saveLocalDraft">Salvar</button>
                </div>
              </div>
            </aside>
          </Transition>
            <!-- Aside Setores: asPage => overlay direita; modal => aside interno -->
            <Transition name="slide-right" appear>
              <div v-if="setorDrawerOpen && asPage" class="fixed inset-0 z-50">
                <div class="absolute inset-0 bg-black/40" @click="closeSetorDrawer" />
                <aside class="absolute right-0 top-0 h-full w-full sm:w-[420px] lg:w-[560px] bg-white dark:bg-zinc-900 border-l shadow-xl flex flex-col">
                  <div class="flex items-center justify-between p-3 border-b sticky top-0 bg-white/95 dark:bg-zinc-900/95 z-10">
                    <h5 class="text-base font-semibold truncate">{{ setorEditIndex === -1 ? 'Novo setor' : 'Editar setor' }}</h5>
                    <button class="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="closeSetorDrawer" aria-label="Fechar">✕</button>
                  </div>

                  <div class="p-4 space-y-3 overflow-y-auto">
                    <div class="flex items-center gap-2">
                      <label class="text-xs w-16">Local</label>
                      <select v-model="setorDraft.local_id" class="form-input w-full" @change="preloadSetoresFor(setorDraft.local_id)">
                        <option value="">Selecione...</option>
                        <option v-for="opt in localOptions" :key="'lo'+opt.value" :value="opt.value">{{ opt.label }}</option>
                      </select>
                    </div>
                    <div class="flex items-center gap-2">
                      <label class="text-xs w-16">Setor</label>
                      <input v-model="setorDraft.setor" placeholder="Nome do setor*" class="form-input w-full" />
                    </div>
                  </div>

                  <div class="mt-auto p-3 border-t bg-white dark:bg-zinc-900">
                    <div class="flex justify-end gap-2">
                      <button class="btn btn-secondary btn-sm" @click="closeSetorDrawer">Cancelar</button>
                      <button class="btn btn-primary btn-sm" @click="saveSetorDraft">Salvar</button>
                    </div>
                  </div>
                </aside>
              </div>
              <aside v-else-if="setorDrawerOpen" class="absolute inset-y-0 right-0 z-40 w-[350px] max-w-[60%] bg-gray-100 dark:bg-zinc-900 border-l shadow-xl flex flex-col">
                <div class="flex items-center justify-between p-2 border-b sticky top-0 bg-white/95 dark:bg-zinc-900/95 z-10">
                  <h5 class="text-sm font-semibold truncate">{{ setorEditIndex === -1 ? 'Novo setor' : 'Editar setor' }}</h5>
                  <button class="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="closeSetorDrawer" aria-label="Fechar">✕</button>

                </div>

                <div class="p-3 space-y-2 overflow-y-auto">
                  <div class="flex items-center gap-2">
                    <label class="text-xs w-16">Local</label>
                    <select v-model="setorDraft.local_id" class="form-input w-full" @change="preloadSetoresFor(setorDraft.local_id)">
                      <option value="">Selecione...</option>
                      <option v-for="opt in localOptions" :key="'lo'+opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </div>
                  <div class="flex items-center gap-2">
                    <label class="text-xs w-16">Setor</label>
                    <input v-model="setorDraft.setor" placeholder="Nome do setor*" class="form-input w-full" />
                  </div>
                </div>

                <div class="mt-auto p-3 border-t bg-white dark:bg-zinc-900">
                  <div class="flex justify-end gap-2">
                    <button class="btn btn-secondary btn-sm" @click="closeSetorDrawer">Cancelar</button>
                    <button class="btn btn-primary btn-sm" @click="saveSetorDraft">Salvar</button>
                  </div>
                </div>
              </aside>
            </Transition>
            <aside v-if="funcDrawerOpen" class="fixed inset-0 left-0 z-50 w-full bg-white dark:bg-zinc-900 shadow-xl flex flex-col">
              <div class="flex items-center justify-between p-2 border-b sticky top-0 bg-white/95 dark:bg-zinc-900/95 z-10">
                <h5 class="text-sm font-semibold truncate">{{ funcEditIndex === -1 ? 'Nova função' : 'Editar função' }}</h5>
                <button class="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="closeFuncDrawer" aria-label="Fechar">✕</button>
              </div>

              <div class="p-3 space-y-2 overflow-y-auto">
                <div class="flex items-center gap-2">
                  <label class="text-xs w-16">Local</label>
                  <select v-model="funcDraft.local_id" class="form-input w-full" @change="preloadSetoresFor(funcDraft.local_id)">
                    <option value="">Selecione...</option>
                    <option v-for="opt in localOptions" :key="'lo'+opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </div>
                <div class="flex items-center gap-2">
                  <label class="text-xs w-16">Setor</label>
                  <select v-model="funcDraft.setor" class="form-input w-full">
                    <option value="">Selecione um setor...</option>
                    <option v-for="opt in getSetorOptions(funcDraft.local_id)" :key="'st'+(opt.value ?? opt.id ?? opt.text ?? opt.setor)" :value="opt.text ?? opt.label ?? opt.nome ?? opt.setor">{{ opt.text ?? opt.label ?? opt.nome ?? opt.setor }}</option>
                  </select>
                </div>
                <div class="space-y-2">
                  <div class="flex flex-col gap-1">
                    <label class="text-xs">Atividade</label>
                    <div class="relative">
                      <input v-model="funcDraft.atividade" @focus="showAtvDropdown = true; ensureAtividades()" @input="showAtvDropdown = true" placeholder="Buscar atividade..." class="form-input w-full" />
                      <ul v-if="showAtvDropdown && filteredAtividades.length" class="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border bg-white text-sm shadow dark:border-zinc-700 dark:bg-zinc-900">
                        <li v-for="opt in filteredAtividades" :key="'atv'+opt.value" class="cursor-pointer px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" @mousedown.prevent="selectAtividade(opt)">{{ opt.text }}</li>
                      </ul>
                    </div>
                  </div>
                  <input v-model="funcDraft.funcao" placeholder="Função" class="form-input" />
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-1 gap-2">
                  <div class="flex items-center gap-4">
                    <label class="inline-flex items-center gap-2">
                      <input type="radio" value="HORA" v-model="funcDraft.medicao" />
                      <span>Por Hora</span>
                    </label>
                    <label class="inline-flex items-center gap-2">
                      <input type="radio" value="VALOR_FECHADO" v-model="funcDraft.medicao" />
                      <span>Valor Fechado</span>
                    </label>
                  </div>
                  <input v-model="funcDraft.cargaHoras" placeholder="Carga (ex: 220h/mês)" class="form-input" />
                  <input v-model="funcDraft.maximoAdic" placeholder="Adicional Máx" class="form-input" />
                </div>
                <p class="text-xs text-zinc-600">Valores Profissional</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input v-model="funcDraft.horaNorProf" placeholder="Normal" class="form-input" />
                  <input v-model="funcDraft.extraProf" placeholder="Extra" class="form-input" />
                  <input v-model="funcDraft.noturnoProf" placeholder="Noturno" class="form-input" />
                  <input v-model="funcDraft.extraNotProf" placeholder="Extra Noturno" class="form-input" />
                </div>
                <p class="text-xs text-zinc-600 bor">Valores Cliente</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input v-model="funcDraft.horaNorCli" placeholder="Normal" class="form-input" />
                  <input v-model="funcDraft.extraCli" placeholder="Extra" class="form-input" />
                  <input v-model="funcDraft.noturnoCli" placeholder="Noturno" class="form-input" />
                  <input v-model="funcDraft.extraNotCli" placeholder="Extra Noturno" class="form-input" />
                </div>
              </div>

              <div class="mt-auto p-3 border-t bg-white dark:bg-zinc-900">
                <div class="flex justify-end gap-2">
                  <button class="btn btn-secondary btn-sm" @click="closeFuncDrawer">Cancelar</button>
                  <button class="btn btn-primary btn-sm" @click="saveFuncDraft">Salvar</button>
                </div>
              </div>
            </aside>




        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>



// Drawer Funções (adicionar/editar)
const funcDrawerOpen = ref(false)
const funcEditIndex = ref(-1)



// Atividades (Funções)
const atividadesOptions = ref([])
async function ensureAtividades(){
  if (atividadesOptions.value.length) return
  try {
    const rows = await listAtividades(new URLSearchParams())
    atividadesOptions.value = rows
  } catch (e) {
    console.warn('[ensureAtividades]', e)
    atividadesOptions.value = []
  }
}

// Estado e helpers do autocomplete de Atividade
const showAtvDropdown = ref(false)
const filteredAtividades = computed(() => {
  const q = (funcDraft.value.atividade || '').toString().toLowerCase().trim()
  if (!q) return atividadesOptions.value
  return atividadesOptions.value.filter(o => (o.text || '').toLowerCase().includes(q))
})
function selectAtividade(opt){
  funcDraft.value.atividade = opt?.text ?? ''
  showAtvDropdown.value = false
}


const funcDraft = ref({ id: undefined, local_id:'', setor:'', atividade:'', funcao:'', uniforme:'', medicao:'HORA', cargaHoras:'', maximoAdic:'', horaNorProf:'', extraProf:'', noturnoProf:'', extraNotProf:'', horaNorCli:'', extraCli:'', noturnoCli:'', extraNotCli:'' })

async function openFuncDrawer(index = -1){
  try { if (props.editId) await refreshLocais() } catch (e) { console.warn('[openFuncDrawer.refreshLocais]', e) }
  await ensureAtividades()
  funcEditIndex.value = index


  if (index >= 0) funcDraft.value = { ...(localForm.value.funcoes?.[index] || {}) }
  else funcDraft.value = { id: undefined, local_id:'', setor:'', atividade:'', funcao:'', uniforme:'', medicao:'HORA', cargaHoras:'', maximoAdic:'', horaNorProf:'', extraProf:'', noturnoProf:'', extraNotProf:'', horaNorCli:'', extraCli:'', noturnoCli:'', extraNotCli:'' }
  try { if (funcDraft.value.local_id) await preloadSetoresFor(funcDraft.value.local_id) } catch (e) {}
  funcDrawerOpen.value = true

// Quando usuário mudar o Local dentro do drawer de Funções, pré-carrega os setores
watch(() => funcDraft.value.local_id, async (loc) => {
  if (!loc) return
  try { await preloadSetoresFor(loc) } catch (e) { console.warn('[funcoes.local_id preload]', e) }
})

}
function closeFuncDrawer(){ funcDrawerOpen.value = false }

async function saveFuncDraft(){
  try{
    const idCliente = props.editId
    const p = funcDraft.value
    const payload = {
      idCliente,
      local: p.local_id || p.local,
      setor: p.setor,
      atividade: p.atividade,
      funcao: (p.funcao||'').trim(),
      uniforme: p.uniforme,
      medicao: p.medicao,
      cargaHoras: p.cargaHoras,
      maximoAdic: p.maximoAdic,
      horaNorProf: p.horaNorProf,
      extraProf: p.extraProf,
      noturnoProf: p.noturnoProf,
      extraNotProf: p.extraNotProf,
      horaNorCli: p.horaNorCli,
      extraCli: p.extraCli,
      noturnoCli: p.noturnoCli,
      extraNotCli: p.extraNotCli,
    }
    if (!payload.local || !payload.setor || !payload.funcao){ window.$toast?.error('Informe Local, Setor e Função'); return }

    if (!idCliente){
      if (!localForm.value.funcoes) localForm.value.funcoes = []
      if (funcEditIndex.value >= 0) localForm.value.funcoes.splice(funcEditIndex.value,1,{ ...p })
      else localForm.value.funcoes.push({ ...p })
      window.$toast?.success('Função atualizada (aguardando salvar cliente)')
      closeFuncDrawer(); return
    }

    const current = funcEditIndex.value >= 0 ? (localForm.value.funcoes?.[funcEditIndex.value] || {}) : null
    if (current?.id){
      await updateClientFunction({ ...payload, id: current.id }, new URLSearchParams())
      window.$toast?.success('Função atualizada com sucesso')
    } else {
      await createClientFunction(payload, new URLSearchParams())
      window.$toast?.success('Função criada com sucesso')
    }

    const res = await findClientFunctions(idCliente, new URLSearchParams())
    const rows = Array.isArray(res?.data) ? res.data : (res?.rows || res || [])
    localForm.value.funcoes = (rows || []).map(r => ({
      id: r.id,
      local_id: r.local_id ?? r.id_unidade ?? r.idLocal ?? r.local ?? r.unidade_id,
      setor: r.setor ?? r.nome_setor ?? r.nomeSetor,
      atividade: r.atividade ?? r.atividade_nome,
      funcao: r.funcao,
      uniforme: r.uniforme,
      medicao: r.medicao ?? r.medida,
      cargaHoras: r.cargaHoras ?? r.carga,
      maximoAdic: r.maximoAdic ?? r.adicional_max,
      horaNorProf: r.horaNorProf ?? r.normal_prof,
      extraProf: r.extraProf ?? r.extra_prof,
      noturnoProf: r.noturnoProf ?? r.noturno_prof,
      extraNotProf: r.extraNotProf ?? r.extra_noturno_prof,
      horaNorCli: r.horaNorCli ?? r.normal_cliente,
      extraCli: r.extraCli ?? r.extra_cliente,
      noturnoCli: r.noturnoCli ?? r.noturno_cliente,
      extraNotCli: r.extraNotCli ?? r.extra_noturno_cliente,
    }))
  } catch(e){ console.error('[saveFuncDraft]', e); window.$toast?.error('Falha ao salvar função') }
  finally { closeFuncDrawer() }
}



import { ref, watch, computed } from 'vue'

import { listAtividades } from '../services/clients'


import Icon from './Icon.vue'

import { listSetores, listRegioes, findClientSector, findClientFunctions, findClientUsers, findClientManagers, createClientUnit, updateClientUnit, deleteClientUnit, findTaxSituation, findClientUnitLocation, createClientSector, updateClientSector, deleteClientSector, createClientFunction, updateClientFunction, deleteClientFunction } from '../services/clients'

// util debounce simples (fora do template)
function debounce(fn, wait=300){
  let t
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait) }
}
const debouncedRefreshLocais = debounce(async () => { try { await refreshLocais() } catch(e){} }, 300)

const props = defineProps({
  // Se true, renderiza em modo página (sem overlay/backdrop) abaixo do breadcrumb
  asPage: { type: Boolean, default: false },
  modelValue: { type: Boolean, default: false },
  editId: { type: [String, Number], default: null },
  form: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update:modelValue', 'save'])
const tab = ref('dados')

// Sempre voltar para a primeira aba ao fechar o modal ou trocar de registro
watch(() => props.modelValue, (v) => {
  if (!v) {
    tab.value = 'dados'
    // fecha qualquer UI auxiliar
    try { localDrawerOpen.value = false } catch (e) {}
    try { openLocalMenuIndex.value = -1 } catch (e) {}
    try { openSetorMenuIndex.value = -1 } catch (e) {}
    try { openFuncMenuIndex.value = -1 } catch (e) {}
    try { openUserMenuIndex.value = -1 } catch (e) {}
    try { openGestorMenuIndex.value = -1 } catch (e) {}
    try { setorEditIndex.value = -1 } catch (e) {}
    try { funcEditIndex.value = -1 } catch (e) {}
    try { userEditIndex.value = -1 } catch (e) {}
    try { gestorEditIndex.value = -1 } catch (e) {}
  }
})
watch(() => props.editId, () => { tab.value = 'dados' })


// Trablhar com cópia local e emitir no save
const localForm = ref({ ...props.form })
watch(() => props.form, (v) => { localForm.value = { ...v } }, { deep: true })

function onSave(){ emit('save', { ...localForm.value }) }

function addRow(section, obj){
  if (!localForm.value[section]) localForm.value[section] = []

  localForm.value[section].push({ ...obj })
}
function removeRow(section, idx){
  if (Array.isArray(localForm.value[section])) localForm.value[section].splice(idx,1)
}


// Máscaras e validações leves
function onlyDigits(s){ return String(s || '').replace(/[^0-9]/g, '') }
function maskCNPJ(e){
  const v = onlyDigits(e?.target?.value ?? localForm.value.cnpj).slice(0,14)
  let out = ''
  if (v.length > 12) out = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  else if (v.length > 8) out = v.replace(/(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4')
  else if (v.length > 5) out = v.replace(/(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3')
  else if (v.length > 2) out = v.replace(/(\d{2})(\d{0,3})/, '$1.$2')
  else out = v
  localForm.value.cnpj = out
}

function maskPhone(field){
  const v = onlyDigits(localForm.value[field]).slice(0,11)
  if (v.length > 10) localForm.value[field] = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  else if (v.length > 6) localForm.value[field] = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
  else if (v.length > 2) localForm.value[field] = v.replace(/(\d{2})(\d{0,5})/, '($1) $2')
  else localForm.value[field] = v
}

function maskDate(field){
  const v = onlyDigits(localForm.value[field]).slice(0,8)
  if (v.length > 4) localForm.value[field] = v.replace(/(\d{2})(\d{2})(\d{0,4})/, '$1/$2/$3')
  else if (v.length > 2) localForm.value[field] = v.replace(/(\d{2})(\d{0,2})/, '$1/$2')
  else localForm.value[field] = v
}

// Carrega Setores do cliente quando abrir a aba (fallback quando o getClient não traz setores)
watch([() => tab.value, () => props.editId], async ([t, id]) => {
  if (t === 'setores' && id && (!localForm.value.setores || localForm.value.setores.length === 0)) {
    try {
      const res = await findClientSector(id, new URLSearchParams())
      const rows = Array.isArray(res?.data) ? res.data : (res?.rows || res || [])
      localForm.value.setores = (rows || []).map(r => ({
        id: r.id_setor ?? r.id ?? r.setor_id,
        local_id: r.id_unidade ?? r.local_id ?? r.idLocal ?? r.unidade_id ?? r.id,
        setor: r.nome ?? r.setor ?? r.name ?? ''
      }))
    } catch (e) { console.warn('[load setores]', e) }
  }
})
// Fallback para Funções
watch([() => tab.value, () => props.editId], async ([t, id]) => {
  if (t === 'funcoes' && id && (!localForm.value.funcoes || localForm.value.funcoes.length === 0)) {
    try {
      const res = await findClientFunctions(id, new URLSearchParams())
      const rows = Array.isArray(res?.data) ? res.data : (res?.rows || res || [])
      localForm.value.funcoes = (rows || []).map(r => ({
        local: r.local || r.nomeLocal || r.local_nome || r.nome || '',
        setor: r.setor || r.nome_setor || r.nomeSetor || '',
        atividade: r.atividade || r.atividade_nome || '',
        funcao: r.funcao || r.nome_funcao || r.nomeFuncao || '',
        normal: r.normal ?? r.valor_normal ?? '',
        extra: r.extra ?? r.valor_extra ?? '',
        noturno: r.noturno ?? r.valor_noturno ?? '',
        extra_noturno: r.extra_noturno ?? r.valor_extra_noturno ?? '',
        normal_cliente: r.normal_cliente ?? r.cliente_normal ?? '',
        extra_cliente: r.extra_cliente ?? r.cliente_extra ?? '',
        noturno_cliente: r.noturno_cliente ?? r.cliente_noturno ?? '',
        extra_noturno_cliente: r.extra_noturno_cliente ?? r.cliente_extra_noturno ?? '',
        medida: r.medida || r.unidade || '',
        carga: r.carga || r.carga_horaria || '',
        adicional_max: r.adicional_max || r.adicionalMax || ''
      }))
    } catch (e) { console.warn('[load funcoes]', e) }
  }
})

// Fallback para Usuários
watch([() => tab.value, () => props.editId], async ([t, id]) => {
  if (t === 'usuarios' && id && (!localForm.value.usuarios || localForm.value.usuarios.length === 0)) {
    try {
      const res = await findClientUsers(id, new URLSearchParams())
      const rows = Array.isArray(res?.data) ? res.data : (res?.rows || res || [])
      localForm.value.usuarios = (rows || []).map(r => ({
        usuario: r.usuario || r.nome || r.name || '',
        email: r.email || r.mail || '',
        perfil: r.perfil || r.role || r.perfil_nome || '',
        unidades_liberadas: r.unidades_liberadas || r.unidades || r.unidadesLiberadas || ''
      }))
    } catch (e) { console.warn('[load usuarios]', e) }
  }
})

// Fallback para Gestores
watch([() => tab.value, () => props.editId], async ([t, id]) => {
  if (t === 'gestores' && id && (!localForm.value.gestores || localForm.value.gestores.length === 0)) {
    try {
      const res = await findClientManagers(id, new URLSearchParams())
      const rows = Array.isArray(res?.data) ? res.data : (res?.rows || res || [])
      localForm.value.gestores = (rows || []).map(r => ({
        local: r.local || r.nomeLocal || r.local_nome || r.nome || '',
        setor: r.setor || r.nome_setor || r.nomeSetor || '',
        atividade: r.atividade || r.atividade_nome || '',
        gestor: r.gestor || r.nome_gestor || r.nomeGestor || r.responsavel || '',
        periodo_dia: r.periodo_dia || r.periodoDia || '',
        periodo_mes: r.periodo_mes || r.periodoMes || ''
      }))
    } catch (e) { console.warn('[load gestores]', e) }
  }
})


// Dropdown Funções
const openFuncMenuIndex = ref(-1)
function toggleFuncMenu(i){ openFuncMenuIndex.value = openFuncMenuIndex.value === i ? -1 : i }
function onEditFunc(i){ openFuncMenuIndex.value = -1; openFuncDrawer(i) }
function onDuplicateFunc(i){ openFuncMenuIndex.value = -1; const fn = localForm.value.funcoes?.[i]; if (fn) addRow('funcoes', { ...fn }) }
function onRemoveFunc(i){ openFuncMenuIndex.value = -1; removeRow('funcoes', i) }


// Dropdown Usuários
const openUserMenuIndex = ref(-1)
const userEditIndex = ref(-1)
const userDrawerOpen = ref(false)
const userDraft = ref({ usuario:'', email:'', perfil:'', unidades_liberadas: [] })
function toggleUserMenu(i){ openUserMenuIndex.value = openUserMenuIndex.value === i ? -1 : i }
function onEditUser(i){ openUserMenuIndex.value = -1; openUserDrawer(i) }
function addUser(){ openUserDrawer(-1) }
function openUserDrawer(i){
  userEditIndex.value = i
  const src = i >= 0 ? (localForm.value.usuarios?.[i] || {}) : { usuario:'', email:'', perfil:'', unidades_liberadas: [] }
  userDraft.value = { usuario: src.usuario || '', email: src.email || '', perfil: src.perfil || '', unidades_liberadas: Array.isArray(src.unidades_liberadas) ? src.unidades_liberadas : (src.unidades_liberadas ? String(src.unidades_liberadas).split(',').map(s=>s.trim()) : []) }
  userDrawerOpen.value = true
}
function closeUserDrawer(){ userDrawerOpen.value = false }
function saveUserDraft(){
  const payload = { ...userDraft.value, unidades_liberadas: Array.isArray(userDraft.value.unidades_liberadas) ? userDraft.value.unidades_liberadas.join(', ') : (userDraft.value.unidades_liberadas || '') }
  if (userEditIndex.value >= 0) localForm.value.usuarios[userEditIndex.value] = payload
  else addRow('usuarios', payload)
  userDrawerOpen.value = false
}
function onDuplicateUser(i){ openUserMenuIndex.value = -1; const us = localForm.value.usuarios?.[i]; if (us) addRow('usuarios', { ...us }) }
function onRemoveUser(i){ openUserMenuIndex.value = -1; removeRow('usuarios', i) }

// Dropdown Gestores
const openGestorMenuIndex = ref(-1)
const gestorEditIndex = ref(-1)
function toggleGestorMenu(i){ openGestorMenuIndex.value = openGestorMenuIndex.value === i ? -1 : i }
function onEditGestor(i){ openGestorMenuIndex.value = -1; gestorEditIndex.value = i }
function onDuplicateGestor(i){ openGestorMenuIndex.value = -1; const gs = localForm.value.gestores?.[i]; if (gs) addRow('gestores', { ...gs }) }
function onRemoveGestor(i){ openGestorMenuIndex.value = -1; removeRow('gestores', i) }


// Ações dropdown Setores
const openSetorMenuIndex = ref(-1)
const setorEditIndex = ref(-1)
function toggleSetorMenu(i){ openSetorMenuIndex.value = openSetorMenuIndex.value === i ? -1 : i }
function onEditSetor(i){ openSetorMenuIndex.value = -1; openSetorDrawer(i) }
function onDuplicateSetor(i){ openSetorMenuIndex.value = -1; const st = localForm.value.setores?.[i]; if (st) addRow('setores', { ...st }) }
function onRemoveSetor(i){ openSetorMenuIndex.value = -1; return removeSetorImmediate(i) }

function localLabel(local_id){
  const opt = (localForm.value.locais||[]).find(l => (l.id ?? l.local_id) === local_id)
  return opt?.nome || `Local #${(localForm.value.locais||[]).findIndex(l=> (l.id ?? l.local_id) === local_id) + 1}`
}


function textLabel(v){
  if (v == null) return ''
  if (typeof v === 'string') {
    try {
      const obj = JSON.parse(v)
      if (obj && (obj.text || obj.label)) return String(obj.text || obj.label)
    } catch (_) { /* not json */ }
    return v
  }
  if (typeof v === 'object') return String(v.text || v.label || v.nome || v.name || '')
  return String(v)
}

// Persistência imediata de Locais (CRUD)
async function saveLocalDraft(){
  try {
    // Normaliza payload
    const payload = { ...localDraft.value }
    payload.nome = (payload.nome || '').trim()
    payload.responsavel = (payload.responsavel || '').trim()
    payload.uf = (payload.uf || '').toString().slice(0,2).toUpperCase()
    // compat com backend legado: usar qr_code_fixo (boolean)
    payload.qr_code_fixo = !!payload.qrcode_fixo
    payload.endereco = payload.endereco || payload.logradouro || ''

    // Validações mínimas exigidas pelo backend
    if (!payload.nome) { window.$toast?.error('Informe o nome da unidade'); return }
    if (!payload.responsavel) { window.$toast?.error('Informe o responsável'); return }

    if (!props.editId) {
      // Sem ID de cliente ainda: mantém localmente
      if (!localForm.value.locais) localForm.value.locais = []
      if (localEditIndex.value >= 0) localForm.value.locais.splice(localEditIndex.value, 1, { ...payload })
      else localForm.value.locais.push({ ...payload })
      window.$toast?.success('Local atualizado (aguardando salvar cliente)')
      closeLocalDrawer()
      return
    }

    // Com cliente existente: salva no backend imediatamente
    const idClient = props.editId
    if (localEditIndex.value >= 0) {
      const current = localForm.value.locais?.[localEditIndex.value] || {}
      const idUnit = current.id || current.local_id
      if (!idUnit) {
        await createClientUnit(idClient, payload, new URLSearchParams())
        await refreshLocais()
        window.$toast?.success('Local criado com sucesso')
      } else {
        await updateClientUnit(idUnit, { ...payload, idCliente: idClient }, new URLSearchParams())
        await refreshLocais()
        window.$toast?.success('Local atualizado com sucesso')
      }
    } else {
      await createClientUnit(idClient, payload, new URLSearchParams())
      await refreshLocais()
      window.$toast?.success('Local criado com sucesso')
    }
  } catch (e) {
    console.error('[saveLocalDraft]', e)
    const msg = (typeof e?.response?.data === 'string' ? e.response.data : (e?.response?.data?.message || e?.message || 'Falha ao salvar local'))
    window.$toast?.error(msg)
  } finally {
    await refreshLocais(); closeLocalDrawer()
  }
  }


async function refreshLocais(){
  if (!props.editId) return
  try{
    const res = await findClientUnitLocation(props.editId, new URLSearchParams())
    const rows = res?.data || res?.rows || res || []
    console.log('[refreshLocais] rows:', Array.isArray(rows) ? rows.length : 'n/a', rows)
    localForm.value.locais = (Array.isArray(rows) ? rows : []).map(r => ({
      id: r.id || r.id_unidade || r.local_id,
      nome: r.nome || r.nome_unidade || r.unidade_nome,
      responsavel: r.responsavel || r.responsavel_unidade,
      telefone: r.telefone || r.telefone_unidade,
      email: r.email || r.email_unidade,
      regiao: r.regiao || '',
      cep: r.cep || '',
      endereco: r.endereco || r.logradouro || '',
      logradouro: r.logradouro || r.endereco || '',
      numero: r.numero || '',
      complemento: r.complemento || '',
      bairro: r.bairro || '',
      cidade: r.cidade || '',
      uf: r.uf || '',
      qrcode_fixo: r.qr_code_fixo ?? r.qrcode_fixo ?? false,
    }))
  } catch(e){ console.warn('[refreshLocais]', e) }
}

async function refreshSetores(){
  if (!props.editId) return
  try{
    const res = await findClientSector(props.editId, new URLSearchParams())
    const rows = Array.isArray(res?.data) ? res.data : (res?.rows || res || [])
    localForm.value.setores = (rows || []).map(r => ({
      id: r.id_setor ?? r.id ?? r.setor_id,
      local_id: r.id_unidade ?? r.local_id ?? r.idLocal ?? r.unidade_id ?? r.id,
      setor: r.nome ?? r.setor ?? r.name ?? ''
    }))
  } catch(e){ console.warn('[refreshSetores]', e) }

// Ao trocar de aba, fecha drawers que não pertencem à aba atual
watch(() => tab.value, (t) => {
  try { if (t !== 'funcoes') funcDrawerOpen.value = false } catch (e) {}

// Ao trocar de aba, feche quaisquer drawers abertos para evitar inconsistência visual
watch(() => tab.value, (t) => {
  try { if (t !== 'locais') localDrawerOpen.value = false } catch (e) {}
  try { if (t !== 'setores') setorDrawerOpen.value = false } catch (e) {}
  try { if (t !== 'funcoes') funcDrawerOpen.value = false } catch (e) {}
  try { openLocalMenuIndex.value = -1 } catch (e) {}
  try { openSetorMenuIndex.value = -1 } catch (e) {}
  try { openFuncMenuIndex.value = -1 } catch (e) {}
  try { openUserMenuIndex.value = -1 } catch (e) {}
  try { openGestorMenuIndex.value = -1 } catch (e) {}
})

  try { if (t !== 'setores') setorDrawerOpen.value = false } catch (e) {}
  try { if (t !== 'locais') localDrawerOpen.value = false } catch (e) {}
})

}

watch([() => tab.value, () => props.editId, () => localForm.value.locais?.length, () => localForm.value.setores?.length], async ([t, id]) => {
  if (!id) return
  if (t==='locais') { await refreshLocais() }
  if (t==='setores') { await refreshSetores() }
  if (t==='funcoes') { await refreshLocais(); await refreshSetores() }
})

// Carrega locais ao abrir o modal para o cliente selecionado
watch(() => props.modelValue, (v) => { if (v && props.editId) debouncedRefreshLocais();
  return })
// Drawer Setores (adicionar/editar)
const setorDrawerOpen = ref(false)

const setorDraft = ref({ id: undefined, local_id:'', setor:'' })

async function openSetorDrawer(index = -1){
  try { if (props.editId) await refreshLocais() } catch (e) { console.warn('[openSetorDrawer.refreshLocais]', e) }
  setorEditIndex.value = index
  if (index >= 0) setorDraft.value = { ...(localForm.value.setores?.[index] || {}) }
  else setorDraft.value = { id: undefined, local_id:'', setor:'' }
  setorDrawerOpen.value = true
}
function closeSetorDrawer(){ setorDrawerOpen.value = false }

async function saveSetorDraft(){
  try{
    const idClient = props.editId
    const payload = { idCliente: idClient, id_Cliente: idClient, id_unidade: setorDraft.value.local_id, nome: (setorDraft.value.setor||'').trim() }
    if (!payload.id_unidade || !payload.nome){ window.$toast?.error('Selecione Local e informe o nome do Setor'); return }

    if (!idClient){
      // cliente novo: apenas local
      if (!localForm.value.setores) localForm.value.setores = []
      if (setorEditIndex.value >= 0) localForm.value.setores.splice(setorEditIndex.value,1,{ ...payload })
      else localForm.value.setores.push({ ...payload })
      window.$toast?.success('Setor atualizado (aguardando salvar cliente)')
      closeSetorDrawer(); return
    }




    // cliente existente
    const current = setorEditIndex.value >= 0 ? (localForm.value.setores?.[setorEditIndex.value] || {}) : null
    const idSetor = current?.id
    if (idSetor){
      await updateClientSector({ ...payload, id: idSetor }, new URLSearchParams({ idCliente: idClient, id_Cliente: idClient }))
      window.$toast?.success('Setor atualizado com sucesso')
    } else {
      await createClientSector(payload, new URLSearchParams({ idCliente: idClient, id_Cliente: idClient }))
      window.$toast?.success('Setor criado com sucesso')
    }
    // refresh list
    const res = await findClientSector(idClient, new URLSearchParams())
    const rows = Array.isArray(res?.data) ? res.data : (res?.rows || res || [])
    localForm.value.setores = (rows || []).map(r => ({ id: r.id_setor ?? r.id ?? r.setor_id, local_id: r.id_unidade ?? r.local_id ?? r.idLocal ?? r.unidade_id ?? r.id, setor: r.nome ?? r.setor ?? r.name ?? '' }))
  } catch(e){
    console.error('[saveSetorDraft]', e); window.$toast?.error('Falha ao salvar setor')
  } finally {
    closeSetorDrawer()
  }
}

async function removeSetorImmediate(i){
  try{
    const st = localForm.value.setores?.[i]
    if (!st) return
    if (!props.editId || !st.id){ removeRow('setores', i); return }
    await deleteClientSector(st.id, new URLSearchParams())
    removeRow('setores', i)
    window.$toast?.success('Setor removido com sucesso')
  } catch(e){ console.error('[remove setor]', e); window.$toast?.error('Falha ao remover setor') }
}

watch(() => props.editId, (id) => {
  if (props.modelValue && id) refreshLocais()



})



async function onRemoveLocalImmediate(i){
  try{
    const lc = localForm.value.locais?.[i]
    if (!lc) return
    if (!props.editId || !lc.id){
      // apenas client-side
      removeRow('locais', i)
      return
    }
    await deleteClientUnit(lc.id, new URLSearchParams())
    removeRow('locais', i)
    window.$toast?.success('Local removido com sucesso')
  } catch(e) {
    console.error('[remove local]', e)
    window.$toast?.error('Falha ao remover local')
  }
}

// Drawer Locais (adicionar/editar)
const localDrawerOpen = ref(false)
const localEditIndex = ref(-1)
const localDraft = ref({ nome:'', responsavel:'', email:'', telefone:'', regiao:'', cep:'', endereco:'', logradouro:'', numero:'', complemento:'', bairro:'', cidade:'', uf:'', qrcode_fixo:false })

function openLocalDrawer(index = -1){
  localEditIndex.value = index
  if (index >= 0) localDraft.value = { ...(localForm.value.locais?.[index] || {}) }
  else localDraft.value = { nome:'', responsavel:'', email:'', telefone:'', regiao:'', cep:'', endereco:'', logradouro:'', numero:'', complemento:'', bairro:'', cidade:'', uf:'', qrcode_fixo:false }
  ensureRegioes()
  localDrawerOpen.value = true
}


// Opções de regiões (carrega on-demand)
const regioesOptions = ref([])
async function ensureRegioes(){
  try{
    if (regioesOptions.value.length) return
    const res = await listRegioes(new URLSearchParams())
    const rows = Array.isArray(res) ? res : (res?.data || res?.rows || [])
    regioesOptions.value = rows.map(r=>({ value: r?.id ?? r?.sigla ?? r?.name ?? r, label: r?.nome ?? r?.label ?? r?.name ?? String(r) }))
  }catch(e){ regioesOptions.value = [] }
}

function maskPhoneDraft(){
  const v = String(localDraft.value.telefone||'').replace(/[^0-9]/g,'').slice(0,11)
  if (v.length > 10) localDraft.value.telefone = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  else if (v.length > 6) localDraft.value.telefone = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
  else if (v.length > 2) localDraft.value.telefone = v.replace(/(\d{2})(\d{0,5})/, '($1) $2')
  else localDraft.value.telefone = v
}

// Ações do dropdown de Locais
const openLocalMenuIndex = ref(-1)
function toggleLocalMenu(i){ openLocalMenuIndex.value = openLocalMenuIndex.value === i ? -1 : i }
function onEditLocal(i){ openLocalMenuIndex.value = -1; openLocalDrawer(i) }
function onDuplicateLocal(i){ openLocalMenuIndex.value = -1; const lc = localForm.value.locais?.[i]; if (lc) addRow('locais', { ...lc, id: undefined }) }
function onRemoveLocal(i){ openLocalMenuIndex.value = -1; return onRemoveLocalImmediate(i) }


function closeLocalDrawer(){ localDrawerOpen.value = false }
async function fetchViaCepDraft(){
  try{
    const clean = (localDraft.value.cep||'').replace(/[^0-9]/g,'')
    if (clean.length !== 8) return
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
    const data = await res.json()
    if (!data?.erro){
      const end = data.logradouro || localDraft.value.endereco || localDraft.value.logradouro
      localDraft.value.endereco = end
      localDraft.value.logradouro = end
      localDraft.value.bairro = data.bairro || localDraft.value.bairro
      localDraft.value.cidade = data.localidade || localDraft.value.cidade
      localDraft.value.uf = data.uf || localDraft.value.uf
      // complemento do ViaCEP ignorado propositalmente
    }
    // tenta atribuir Região automaticamente (SP - São Paulo, heurística por CEP)
    try { assignRegiaoFromCepDraft() } catch (e) { /* noop */ }
  } catch(e){ console.warn('[viaCEP draft]', e) }
}

function assignRegiaoFromCepDraft(){
  const cep = String(localDraft.value.cep||'').replace(/[^0-9]/g,'')
  const city = String(localDraft.value.cidade||'').toLowerCase()
  const uf = String(localDraft.value.uf||'').toUpperCase()
  if (cep.length >= 5 && uf === 'SP' && (city.includes('sao paulo') || city.includes('são paulo'))){
    const p2 = cep.slice(0,2)
    let r = ''
    if (p2 === '01') r = 'CENTRO'
    else if (p2 === '02') r = 'ZONA NORTE'
    else if (p2 === '03') r = 'ZONA LESTE'
    else if (p2 === '04') r = 'ZONA SUL'
    else if (p2 === '05') r = 'ZONA OESTE'
    if (r) localDraft.value.regiao = r
  }
}


// Cache e estados simples para setores por local
const _uiSetores = new Map() // key: String(local_id) -> { loading, options }
function isSetorLoading(local_id){ const k = String(local_id ?? ''); return _uiSetores.get(k)?.loading === true }
function getSetorOptions(local_id){
  const k = String(local_id ?? '')
  const cached = _uiSetores.get(k)?.options
  if (Array.isArray(cached) && cached.length) return cached
  // Fallback: derive from localForm.setores já carregados para o cliente
  const rows = Array.isArray(localForm.value?.setores) ? localForm.value.setores : []
  const list = rows.filter(r => String(r.id_unidade ?? r.local_id ?? r.idLocal ?? r.unidade_id ?? r.id) === k)
  return list.map((r, idx) => {
    const text = r.setor ?? r.nome ?? r.name ?? `Setor ${idx+1}`
    const val = r.setor_id ?? r.id_setor ?? r.id ?? `${k}-${idx+1}`
    return { value: String(val), text: String(text), label: String(text) }
  })
}
async function preloadSetoresFor(local_id){
  const k = String(local_id ?? '')
  if (!k) return
  const rec = _uiSetores.get(k) || { loading:false, options:[] }
  if (rec.options?.length) return // já carregado (ui cache)
  rec.loading = true; _uiSetores.set(k, rec)
  try {
    const rows = await listSetores(k)
    rec.options = (Array.isArray(rows) ? rows : []).map((it, idx) => {
      if (typeof it !== 'object' || it === null) {
        return { value: String(idx+1), label: String(it), text: String(it) }
      }
      const val = it.value ?? it.id ?? it.setor_id ?? it.id_setor ?? (it.local_id ? `${it.local_id}-${idx+1}` : (idx+1))
      const text = it.text ?? it.nome ?? it.setor ?? it.name ?? it.label ?? JSON.stringify(it)
      return { value: String(val), label: String(text), text: String(text) }
    })
  }
  catch(e){ rec.options = [] }
  finally { rec.loading = false; _uiSetores.set(k, rec) }

}



// Carregar opções de Situação Tributária quando abrir a aba Faturamento
const taxSituationOptions = ref([])
watch(() => tab.value, async (t) => {
  if (t === 'faturamento' && taxSituationOptions.value.length === 0) {
    try {
      const res = await findTaxSituation(new URLSearchParams())
      console.log('[findTaxSituation] raw response:', res)
      const rows = Array.isArray(res) ? res : (res?.data || res?.rows || [])
      console.log('[findTaxSituation] normalized rows:', rows)
      taxSituationOptions.value = rows.map((it, idx) => {
        if (typeof it !== 'object' || it === null) {
          return { value: String(it), label: String(it) }
        }
        const valCandidates = [it.value, it.id, it.codigo, it.sigla, it.code, it.key, it.nome, it.name, it.label]
        let value = valCandidates.find(v => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
        if (value == null) value = idx
        const labCandidates = [it.label, it.name, it.descricao, it.description, it.title, it.text, it.nome, it.sigla, it.codigo, value]
        let label = labCandidates.find(v => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
        if (label == null) label = JSON.stringify(it)
        return { value: String(value), label: String(label) }
      })
      console.log('[findTaxSituation] options normalized:', taxSituationOptions.value)
    } catch (e) {
      console.error('[findTaxSituation] error:', e?.response || e)
      taxSituationOptions.value = []
    }
  }
})





// ===== Carregamento de Setores/Funções conforme Local selecionado (helpers de UI) =====

// Também tenta carregar opções assim que o modal abre (evita depender só do clique na aba)
watch(() => props.modelValue, async (open) => {
  if (open && taxSituationOptions.value.length === 0) {
    try {
      const res = await findTaxSituation(new URLSearchParams())
      console.log('[findTaxSituation modal open] raw response:', res)
      const rows = Array.isArray(res) ? res : (res?.data || res?.rows || [])
      console.log('[findTaxSituation modal open] normalized rows:', rows)
      taxSituationOptions.value = rows.map((it, idx) => {
        if (typeof it !== 'object' || it === null) {
          return { value: String(it), label: String(it) }
        }
        const valCandidates = [it.value, it.id, it.codigo, it.sigla, it.code, it.key, it.nome, it.name, it.label]
        let value = valCandidates.find(v => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
        if (value == null) value = idx
        const labCandidates = [it.label, it.name, it.descricao, it.description, it.title, it.text, it.nome, it.sigla, it.codigo, value]
        let label = labCandidates.find(v => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
        if (label == null) label = JSON.stringify(it)
        return { value: String(value), label: String(label) }
      })
      console.log('[findTaxSituation modal open] options normalized:', taxSituationOptions.value)
    } catch (e) {
      console.error('[findTaxSituation modal open] error:', e?.response || e)
      taxSituationOptions.value = []
    }
  }
})

const localOptions = computed(() => (localForm.value.locais || []).map((l, idx) => ({ value: l.id ?? l.local_id ?? (idx + 1), label: l.nome || `Local #${idx+1}` })))


</script>

<style scoped>
/***** Modal animation *****/
.modal-zoom-enter-active,.modal-zoom-leave-active{ transition: all .15s ease; }
.modal-zoom-enter-from,.modal-zoom-leave-to{ transform: scale(.97); opacity:0 }

/* Slide-right animation for right aside */
.slide-right-enter-active, .slide-right-leave-active { transition: transform .18s ease, opacity .18s ease; }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); opacity: 0; }


/* Utilitários locais (substitui @apply) */
.form-label { font-size: 0.75rem; font-weight: 500; color: rgb(63 63 70); margin-bottom: 0.25rem; }
:where(.dark) .form-label { color: rgb(212 212 216); }
.form-input { border-radius: 0.375rem; border: 1px solid rgb(212 212 216); padding: 0.25rem 0.5rem; font-size: 0.875rem; }
.form-input:focus { outline: none; box-shadow: 0 0 0 2px rgb(59 130 246 / .5); border-color: rgb(59 130 246); }
:where(.dark) .form-input { background: rgb(39 39 42); border-color: rgb(63 63 70); color: rgb(244 244 245); }
.form-textarea { min-height: 100px; border-radius: 0.375rem; border: 1px solid rgb(212 212 216); padding: 0.5rem; font-size: 0.875rem; }
.form-textarea:focus { outline: none; box-shadow: 0 0 0 2px rgb(59 130 246 / .5); border-color: rgb(59 130 246); }
:where(.dark) .form-textarea { background: rgb(39 39 42); border-color: rgb(63 63 70); color: rgb(244 244 245); }
.switch { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; }
</style>
