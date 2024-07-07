import { css, html, LitElement, nothing, TemplateResult } from 'lit';

import { property, query, queryAll } from 'lit/decorators.js';

import '@material/mwc-tab-bar';
import '@material/web/button/outlined-button.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/checkbox/checkbox.js';
import '@material/web/dialog/dialog.js';
import '@material/web/list/list.js';
import '@material/web/list/list-item.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/menu/menu.js';

import '@material/web/icon/icon.js';

import '@openenergytools/filterable-lists/dist/selection-list.js';
import '@openenergytools/filterable-lists/dist/action-list.js';

import type { MdCheckbox } from '@material/web/checkbox/checkbox.js';
import type { TabBar } from '@material/mwc-tab-bar';
import type { TextField } from '@material/web/textfield/internal/text-field.js';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdOutlinedTextField } from '@material/web/textfield/outlined-text-field.js';
import type { SelectionList } from '@openenergytools/filterable-lists/dist/selection-list.js';
import type { MdIconButton } from '@material/web/iconbutton/icon-button.js';
import type { MdMenu } from '@material/web/menu/menu';

import { Connection, find, subscribe } from '@openenergytools/scl-lib';
import { newEditEvent } from '@openscd/open-scd-core';
import defaultStencil from './default_stencil.json' with { type: 'json' };

import {
  ControlBlockInfo,
  getMappingInfo
} from './foundation/getMappingInfo.js';
import { combinations } from './combinations.js';
import { getIedDescription } from './getIedDescription.js';

type IED = {
  originalName: string;
  type: string;
  manufacturer: string;
  comment?: string;
  privates: {
    'OpenSCD-Stencil-Id': string;
    'OpenSCD-Stencil-Version': string;
  }[];
};

type Application = {
  version: string;
  description: string;
  deprecated: boolean;
  IEDS: Record<string, IED>;
  ControlBlocks: ControlBlockInfo[];
};

type ControlBlockTableMapping = {
  id: string;
  from: string;
  to: string;
};

type VersionedApplications = {
  category: string;
  name: string;
  description: string;
  versions: Application[];
};

type StencilData = {
  description: string;
  version: string;
  applications: VersionedApplications[];
};

function newIedIdentity(iedName: string | undefined, id: string): string {
  return `${iedName}${id}`;
}

/**
 * A plugin to allow templates of GOOSE and SV using the
 * later binding method based on a JSON description of a configuration.
 */
export default class Stencil extends LitElement {
  @property({ attribute: false })
  doc!: XMLDocument;

  @property() docName!: string;

  @property() editCount!: number;

  @property() tabIndex: number = 0;

  @property() iedMappingStencilData: ControlBlockInfo[] = [];

  @property() uniqueIeds: string[] = [];

  @property() stencilData: StencilData;

  @property() selectedApplication: VersionedApplications | null = null;

  @property() selectedAppVersion: Application | undefined = undefined;

  @property() applicationSelectedIed: Element | null = null;

  @property() applicationSelectedFunction: string | null = null;

  @property() applicationSelectedFunctionReqs: IED | null = null;

  @property() functionToIed: Map<string, string> = new Map();

  @property() createEventListeners: boolean = false;

  @property() showDeprecated: boolean = false;

  @property() templateCreationStage: number = 0;

  @property() createCBsToRemove: ControlBlockTableMapping[] = [];

  // items: SelectItem[] = [];

  @query('mwc-tab-bar') tabBarUI!: TabBar;

  @query('#output') outputStencilUI!: TextField;

  @query('#appcat') appCategory!: TextField;

  @query('#appname') appName!: TextField;

  @query('#appdesc') appDesc!: TextField;

  @query('#appver') appVer!: TextField;

  @query('#appverdesc') appVerDesc!: TextField;

  @query('#appdeprecated') appDeprecated!: MdCheckbox;

  @query('#stendesc') stencilDesc!: TextField;

  @query('#stenver') stencilVersion!: TextField;

  @query('#selection-dialog') iedTemplateSelectorUI!: MdDialog;

  @query('#ied-function-selector-dialog') iedSelectorUI!: MdDialog;

  @query('#selection-list') selectionListUI!: SelectionList;

  @query('#changeStencil') changeStenciLUI!: HTMLInputElement;

  @query('#menuApplicationsButton') menuAppButtonUI!: MdIconButton;

  @query('#menuApplications') menuAppUI!: MdMenu;

  @queryAll('#function > md-outlined-text-field')
  functionIedNamesUI!: TextField[];

  constructor() {
    super();
    this.stencilData = defaultStencil;
  }

  addApplication(): void {
    // need to do some validation
    this.templateCreationStage = 3;
    const iedNameMapping = new Map<string, string>();
    this.functionIedNamesUI.forEach(textField =>
      iedNameMapping.set(textField.dataset.ied!, textField.value)
    );

    const ieds = new Map<string, IED>();
    this.uniqueIeds.forEach(iedName => {
      const ied = this.doc.querySelector(`IED[name="${iedName}"]`)!;
      ieds.set(iedNameMapping.get(iedName) ?? 'Unknown IED', {
        originalName: ied.getAttribute('name')!,
        type: ied.getAttribute('type')!,
        manufacturer: ied.getAttribute('manufacturer')!,
        privates: [
          {
            'OpenSCD-Stencil-Id':
              ied.querySelector(':scope > Private[type="OpenSCD-Stencil-Id"]')
                ?.textContent ?? 'No Stencil ID Found',
            'OpenSCD-Stencil-Version':
              ied.querySelector(
                ':scope > Private[type="OpenSCD-Stencil-Version"]'
              )?.textContent ?? 'No Stencil Version Found'
          }
        ]
      });
    });

    this.stencilData = {
      description: this.stencilDesc.value,
      version: this.stencilVersion.value,
      applications: [
        {
          category: this.appCategory.value ?? 'UnknownCategory',
          name: this.appName.value ?? 'UnknownName',
          description: this.appDesc.value,
          versions: [
            {
              version: this.appVer.value,
              description: this.appVerDesc.value,
              deprecated: this.appDeprecated.checked,
              IEDS: Object.fromEntries(ieds),
              ControlBlocks: this.iedMappingStencilData
            }
          ]
        }
      ]
    };

    const outputText = JSON.stringify(this.stencilData, null, 2);
    this.outputStencilUI.value = outputText;
  }

  saveStencilAsFile(): void {
    const blob = new Blob([this.outputStencilUI.value], {
      type: 'application/xml'
    });

    const a = document.createElement('a');
    a.download = `${this.stencilDesc.value.replace(' ', '_')}_${
      this.stencilVersion.value
    }.json`;

    a.href = URL.createObjectURL(blob);
    a.dataset.downloadurl = ['application/json', a.download, a.href].join(':');
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      URL.revokeObjectURL(a.href);
    }, 5000);

    this.clearStencilCreateData();
  }

  clearStencilCreateData(): void {
    this.uniqueIeds = [];
    this.iedMappingStencilData = [];
  }

  clearIedTemplateSelection(): void {
    if (this.selectionListUI) {
      (
        Array.from(
          this.selectionListUI.shadowRoot!.querySelectorAll(
            'md-list.listitems md-list-item md-checkbox'
          )
        ) as MdCheckbox[]
      ).forEach((cb): void => {
        if (cb.checked) {
          // eslint-disable-next-line no-param-reassign
          cb.checked = false;
          cb.dispatchEvent(new Event('change'));
          cb.requestUpdate();
        }
      });

      const searchField = (this.selectionListUI.shadowRoot!.querySelector(
        'md-outlined-text-field[placeholder="search"]'
      ) as MdOutlinedTextField)!;
      searchField.value = '';
      searchField.dispatchEvent(new Event('input'));
    }
  }

  async loadStencil(event: Event): Promise<void> {
    const file = (<HTMLInputElement | null>event.target)?.files?.item(0);
    if (!file) return;

    const text = await file.text();
    this.stencilData = JSON.parse(text);

    this.changeStenciLUI.onchange = null;
  }

  // eslint-disable-next-line class-methods-use-this
  applyStencil() {
    const errorText: string[] = [];
    let subscriptionsCount = 0;

    const usedFunctionCombinations = [
      ...combinations([...this.functionToIed.keys()], 2)
    ];
    usedFunctionCombinations.forEach((combo: string[]) => {
      const fn1 = combo[0];
      const fn2 = combo[1];
      const fn1Info = this.selectedAppVersion!.IEDS[fn1];
      const fn2Info = this.selectedAppVersion!.IEDS[fn2];
      const newIed1Name = this.functionToIed.get(fn1)!;
      const newIed2Name = this.functionToIed.get(fn2)!;

      this.selectedAppVersion?.ControlBlocks.filter(
        cb =>
          (cb.from === fn1Info.originalName &&
            cb.to === fn2Info.originalName) ||
          (cb.to === fn1Info.originalName && cb.from === fn2Info.originalName)
      ).forEach(cb => {
        const newFromIed =
          cb.from === fn1Info.originalName ? newIed1Name : newIed2Name;
        const newToIed =
          cb.to === fn1Info.originalName ? newIed1Name : newIed2Name;

        const newCbId = newIedIdentity(newFromIed, cb.id);

        const newCb = find(this.doc, cb.type, newCbId);

        if (!newCb) {
          errorText.push(`Could not find CB: ${newCbId}`);
          return;
        }

        const cbSubscriptions = cb.mappings
          .map(mapping => {
            const newSourceId = newIedIdentity(newFromIed, mapping.FCDA);
            const newSource = find(this.doc, 'FCDA', newSourceId);

            if (!newSource) {
              errorText.push(`Could not find FCDA: ${newSourceId}`);
              return null;
            }

            const newSinkId = newIedIdentity(newToIed, mapping.ExtRef);
            const newSink = find(this.doc, 'ExtRef', newSinkId);

            if (!newSink) {
              errorText.push(`Could not find ExtRef: ${newSinkId}`);
              return null;
            }

            return {
              sink: newSink,
              source: {
                fcda: newSource,
                controlBlock: newCb
              }
            };
          })
          .flatMap(mapping => (mapping ? [mapping] : [])) as Connection[];
        subscriptionsCount += cbSubscriptions.length;
        this.dispatchEvent(
          newEditEvent(
            subscribe(cbSubscriptions, {
              force: true,
              ignoreSupervision: true,
              checkOnlyBType: true
            })
          )
        );
      });
    });

    if (errorText) console.warn(errorText);
    if (errorText)
      console.info(`Hurrah, we have done in one click ${subscriptionsCount}`);
  }

  updated(): void {
    if (this.menuAppButtonUI && !this.createEventListeners) {
      this.createEventListeners = true;
      this.menuAppButtonUI.addEventListener('click', () => {
        this.menuAppUI.open = !this.menuAppUI.open;
      });
    }
  }

  protected firstUpdated(): void {
    this.iedSelectorUI.addEventListener('close', () => {
      if (this.applicationSelectedFunction && this.applicationSelectedIed) {
        const iedName = this.applicationSelectedIed.getAttribute('name')!;
        this.functionToIed.set(this.applicationSelectedFunction, iedName);
      }
      if (
        this.applicationSelectedFunction &&
        this.iedSelectorUI.returnValue === 'reset'
      ) {
        this.functionToIed.delete(this.applicationSelectedFunction);
      }
      this.applicationSelectedFunction = null;
      this.applicationSelectedIed = null;
      this.applicationSelectedFunctionReqs = null;
    });
  }

  renderFunctionIedSelector(): TemplateResult {
    // if (!this.applicationSelectedFunction) return html``
    // TODO: It is a roblem if the query
    const func = this.applicationSelectedFunction
      ? this.selectedAppVersion?.IEDS[this.applicationSelectedFunction]
      : null;

    const items = this.doc?.querySelectorAll(
      `:root > IED[type="${func ? func.type : ''}"][manufacturer="${
        func ? func.manufacturer : ''
      }"]`
    );
    return html`<md-dialog
      id="ied-function-selector-dialog"
      @close=${() => {
        if (this.applicationSelectedFunction && this.applicationSelectedIed) {
          const iedName = this.applicationSelectedIed.getAttribute('name')!;
          this.functionToIed.set(this.applicationSelectedFunction, iedName);
        }
        if (
          this.applicationSelectedFunction &&
          this.iedSelectorUI.returnValue === 'reset'
        ) {
          this.functionToIed.delete(this.applicationSelectedFunction);
        }
        this.applicationSelectedFunction = null;
        this.applicationSelectedIed = null;
        this.applicationSelectedFunctionReqs = null;
      }}
      @cancel=${(event: Event) => {
        event.preventDefault();
      }}
    >
      <div slot="headline">
        Select IED for function - ${this.applicationSelectedFunction ?? ''}
      </div>
      <form slot="content" id="ied-selection" method="dialog">
        <action-list
          id="action-list"
          filterable
          .items=${!items
            ? []
            : Array.from(items)
                .filter(ied => {
                  const id = ied.querySelector(
                    ':scope > Private[type="OpenSCD-Stencil-Id"]'
                  )?.textContent;
                  const version = ied.querySelector(
                    ':scope > Private[type="OpenSCD-Stencil-Version"]'
                  )?.textContent;
                  return (
                    !func ||
                    func.privates.some(
                      priv =>
                        priv['OpenSCD-Stencil-Id'] === id &&
                        priv['OpenSCD-Stencil-Version'] === version
                    )
                  );
                })
                .map(ied => {
                  const { firstLine, secondLine } = getIedDescription(ied);

                  return {
                    headline: `${ied.getAttribute('name')!} — ${firstLine}`,
                    supportingText: secondLine,
                    attachedElement: ied,
                    primaryAction: () => {
                      this.applicationSelectedIed = ied;
                      this.iedSelectorUI.returnValue = 'ok';
                      this.iedSelectorUI.close();
                    }
                  };
                })}
        ></action-list>
      </form>
      <div slot="actions">
        <md-text-button
          form="ied-selection"
          value="reset"
          @click="${() => {
            this.iedSelectorUI.returnValue = 'reset';
            this.iedSelectorUI.close();
          }}"
          >Reset</md-text-button
        >
      </div></md-dialog
    >`;
  }

  renderIedsForUse(): TemplateResult {
    return html`${
      this.selectedApplication && this.selectedAppVersion
        ? html`<div>
            <h2>${this.selectedApplication.category}</h2>
            <div style="padding-left:30px;">
              <h3>${this.selectedApplication.name}</h3>
              <p>
                ${this.selectedApplication?.description} -
                ${this.selectedAppVersion.description}
              </p>
            </div>
            <h2>Select IEDs for Function</h2>
            <md-list id="iedsAndFunctions">
              ${Object.keys(this.selectedAppVersion.IEDS).map(iedFunction => {
                const ied = this.selectedAppVersion!.IEDS[iedFunction];

                return html`
                  <md-list-item
                    type="button"
                    @click=${() => {
                      this.applicationSelectedFunction = iedFunction;
                      this.applicationSelectedFunctionReqs = ied;
                      // = (<HTMLElement>event.target).closest('md-list-item')

                      this.iedSelectorUI.show();
                    }}
                  >
                    <div slot="headline">
                      ${iedFunction}${this.functionToIed.get(iedFunction)
                        ? `  ⮕  ${this.functionToIed.get(iedFunction)}`
                        : nothing}
                    </div>
                    <div slot="supporting-text">
                      ${ied.manufacturer} - ${ied.type}
                    </div>
                    <md-icon slot="start">developer_board</md-icon>
                    <md-icon slot="end"
                      >${this.functionToIed.get(iedFunction) !== undefined
                        ? 'check_box'
                        : 'check_box_outline_blank'}</md-icon
                    >
                  </md-list-item>
                `;
              })}
            </md-list>
            <md-outlined-button
              class="button"
              ?disabled=${this.functionToIed.size === 0}
              @click=${() => {
                this.functionToIed = new Map<string, string>();
              }}
              >Clear IEDs
              <md-icon slot="icon">cancel</md-icon>
            </md-outlined-button>
            <md-filled-button
              class="button"
              ?disabled=${this.functionToIed.size === 0}
              @click=${() => this.applyStencil()}
              >Apply Stencil
              <md-icon slot="icon">draw_collage</md-icon>
            </md-filled-button>
          </div> `
        : nothing
    }
  </div>`;
  }

  renderUse(): TemplateResult {
    if (!this.doc)
      return html`<h1>Please open a file to use this functionality</h1>`;

    const appCategories: TemplateResult[] = this.stencilData.applications
      .filter(
        app =>
          app.versions.some(
            version => version.deprecated && this.showDeprecated
          ) || !this.showDeprecated
      )
      .map(app => app.category)
      .filter((item, i, ar) => ar.indexOf(item) === i)
      .map(
        appCategory =>
          html` <md-list-item data-cat="${appCategory}">
              <div slot="headline">${appCategory}</div>
              <md-icon slot="start">ad_group</md-icon>
            </md-list-item>
            ${this.stencilData.applications
              .filter(app => app.category === appCategory)
              .flatMap(app => {
                if (this.showDeprecated === false)
                  this.selectedAppVersion = app.versions.find(
                    appVer => appVer.deprecated === false
                  );

                return html`<md-list-item
                  @click=${(event: Event) => {
                    this.selectedApplication = app;
                    (<HTMLElement>event.target)
                      .closest('md-list')!
                      .querySelectorAll('md-list-item')
                      .forEach(listItem => {
                        listItem.classList.remove('selected');
                      });

                    (<HTMLElement>event.target)
                      .closest('md-list-item')
                      ?.classList.add('selected');
                  }}
                  type="button"
                  data-cat="${appCategory}"
                  data-name="${app.name}"
                >
                  <div slot="headline">${app.name}</div>
                  <div slot="supporting-text">
                    ${app.description}${this.selectedAppVersion?.description ===
                    undefined
                      ? ''
                      : ` - ${this.selectedAppVersion?.description}`}
                  </div>
                  <div slot="trailing-supporting-text">
                    ${this.selectedAppVersion
                      ? this.selectedAppVersion.version
                      : 'No available version'}
                  </div>
                  <md-icon slot="start">draw_collage</md-icon>
                </md-list-item>`;
              })}`
      );

    return html`
      <div id="headline">
        <h1 id="stencilName">
          ${this.stencilData.description}<code id="stencilVersion"
            >${defaultStencil.version}</code
          >
        </h1>
        <span style="position: relative">
          <md-outlined-button
            id="more"
            @click=${() => {
              this.changeStenciLUI.click();
            }}
            >Change Stencil
            <md-icon slot="icon">file_open</md-icon>
          </md-outlined-button>
        </span>
      </div>
      <section>
        <div id="appMaker">
          <div>
            <h2 id="appMenuHeader">
              Select Application
              <md-icon-button id="menuApplicationsButton"
                ><md-icon>more_vert</md-icon></md-icon-button
              >
              <md-menu
                positioning="popover"
                id="menuApplications"
                anchor="menuApplicationsButton"
              >
                <md-menu-item
                  @click=${() => {
                    this.showDeprecated = !this.showDeprecated;
                  }}
                >
                  <div slot="headline">
                    <label class="menu-item">
                      <md-checkbox
                        touch-target="wrapper"
                        ?checked=${this.showDeprecated}
                      ></md-checkbox>
                      Show Deprecated
                    </label>
                  </div>
                </md-menu-item>
              </md-menu>
            </h2>

            <md-list id="applications">${appCategories}</md-list>
          </div>
          ${this.renderIedsForUse()}
        </div>
      </section>
      <input
        id="changeStencil"
        @click=${({ target }: MouseEvent) => {
          // eslint-disable-next-line no-param-reassign
          (<HTMLInputElement>target).value = '';
        }}
        @change=${this.loadStencil}
        type="file"
      />
    `;
  }

  renderCbSelectionTable(): TemplateResult {
    const processedIeds = new Map<string, string[]>();
    this.iedMappingStencilData.forEach(cb => {
      const existingCbs = processedIeds.get(cb.from);
      if (existingCbs && !existingCbs.includes(cb.id)) {
        existingCbs.push(cb.id);
        processedIeds.set(cb.from, existingCbs);
      } else {
        processedIeds.set(cb.from, [cb.id]);
      }
    });

    const toIedNames = this.iedMappingStencilData
      .map(cb => cb.to)
      .filter((item, i, ar) => ar.indexOf(item) === i)
      .sort();

    const rowIedNames = this.iedMappingStencilData
      .map(cb => cb.from)
      .filter((item, i, ar) => ar.indexOf(item) === i)
      .sort();

    const rowInfo = rowIedNames.flatMap(iedName => ({
      ied: iedName,
      cbs: processedIeds.get(iedName)
    }));

    return html`<h1>Select Template Control Blocks</h1>
      <div class="group">
        <table>
          <caption>
            Control Block Mappings
          </caption>
          <thead>
            <tr>
              <th scope="col"></th>
              <th scope="col" colspan="${toIedNames.length}">To</th>
            </tr>
            <tr>
              <th scope="col">From</th>
              ${toIedNames.map(
                iedName => html` <th class="stay" scope="col">${iedName}</th> `
              )}
            </tr>
          </thead>
          <tbody>
            ${rowInfo.map(
              row =>
                html`<tr>
                    <th scope="row" class="iedname">${row.ied}</th>
                    <th scope="row" colspan="${toIedNames.length}"></th>
                  </tr>
                  ${row.cbs!.map(
                    cbName =>
                      html`<tr>
                        <th
                          scope="row"
                          class="cbname"
                          data-fromIed="${row.ied}"
                          data-fromCb="${cbName.substring(2)}"
                        >
                          ${cbName}
                        </th>
                        ${toIedNames.map(toIed => {
                          const mapped = this.iedMappingStencilData.find(
                            cb =>
                              cb.id === cbName &&
                              cb.from === row.ied &&
                              cb.to === toIed
                          );
                          return html`<td class="${mapped ? 'mapcell' : ''}">
                            ${mapped && this.templateCreationStage < 2
                              ? html`<md-checkbox
                                  data-fromIed="${row.ied}"
                                  data-fromCb="${cbName}"
                                  data-toIed="${toIed}"
                                  touch-target="wrapper"
                                  ?checked=${true}
                                  @change=${(event: Event) => {
                                    // eslint-disable-next-line prefer-destructuring
                                    const target = event.target as MdCheckbox;
                                    const { fromcb, fromied, toied } =
                                      target.dataset!;

                                    const cbObject: ControlBlockTableMapping = {
                                      id: fromcb!,
                                      from: fromied!,
                                      to: toied!
                                    };

                                    if (
                                      // we use true to remove because the UI
                                      // update has not yet happened
                                      target.checked === true
                                    ) {
                                      this.createCBsToRemove =
                                        this.createCBsToRemove.filter(
                                          cb =>
                                            cb.id === cbObject.id &&
                                            cb.from === cbObject.from &&
                                            cb.to === cbObject.to
                                        );
                                    } else if (target.checked === false) {
                                      this.createCBsToRemove.push(cbObject!);
                                    }
                                    console.log(this.createCBsToRemove);
                                  }}
                                ></md-checkbox>`
                              : nothing}
                            ${mapped && this.templateCreationStage >= 2
                              ? html`✅︎`
                              : nothing}
                          </td>`;
                        })}
                      </tr>`
                  )}`
            )}
          </tbody>
        </table>
      </div>
      <md-filled-button
        class="button"
        ?disabled=${this.iedMappingStencilData.length === 0}
        @click=${() => {
          this.templateCreationStage = 2;

          // remove unused control blocks
          // TODO: Does this suggest my data structure is bad?
          this.iedMappingStencilData = this.iedMappingStencilData.filter(
            cbInf =>
              !this.createCBsToRemove.find(
                cb =>
                  cb.id === cbInf.id &&
                  cb.from === cbInf.from &&
                  cb.to === cbInf.to
              )
          );

          // now generate list of remaining IEDs for naming
          this.iedMappingStencilData.forEach((val: ControlBlockInfo) => {
            if (!this.uniqueIeds.includes(val.to)) this.uniqueIeds.push(val.to);
            if (!this.uniqueIeds.includes(val.from))
              this.uniqueIeds.push(val.from);
          });
        }}
        >Name IEDs for Functions
        <md-icon slot="icon">draw_collage</md-icon>
      </md-filled-button> `;
  }

  renderIedsToFunctionNaming(): TemplateResult {
    return html`<h1>Name IEDs with Functions</h1>
      <div class="group appinf" id="function">
        ${this.uniqueIeds.map(
          ied =>
            html`<md-outlined-text-field
              class="iedfunction"
              data-ied="${ied}"
              label="IED Function (was ${ied})"
              value="${ied}"
            ></md-outlined-text-field>`
        )}
      </div>
      <md-filled-button
        class="button"
        ?disabled=${this.uniqueIeds.length === 0}
        @click=${() => this.addApplication()}
        >Add Application
        <md-icon slot="icon">draw_collage</md-icon>
      </md-filled-button>`;
  }

  renderOutputJSON(): TemplateResult {
    return html`<div class="output">
      <md-outlined-text-field
        id="output"
        type="textarea"
        label="Stencil Output File"
        value="${JSON.stringify(this.stencilData, null, 2)}"
        rows="10"
      >
      </md-outlined-text-field>
      <md-outlined-button
        class="button"
        @click=${() => this.saveStencilAsFile()}
        >Download
        <md-icon slot="icon">download</md-icon>
      </md-outlined-button>
    </div>`;
  }

  renderCreate(): TemplateResult {
    this.createEventListeners = false;
    if (!this.doc)
      return html`<h1>Please open a file to use this functionality</h1>`;
    return html`
      <h1>
        Enter Stencil Data
        <md-outlined-button
          class="button"
          @click=${() => {
            this.templateCreationStage = 0;
            this.iedMappingStencilData = [];
            this.uniqueIeds = [];
            this.createCBsToRemove = [];
          }}
          >Reset Template
          <md-icon slot="icon">draw_collage</md-icon>
        </md-outlined-button>
      </h1>
      <div class="group appinf">
        <md-outlined-text-field
          id="stendesc"
          label="Description"
          value="Transpower Stencil"
        >
        </md-outlined-text-field>
        <md-outlined-text-field id="stenver" label="Version" value="1.0.0">
        </md-outlined-text-field>
      </div>
      <h1>Enter Application Data</h1>
      <div class="group appinf">
        <md-outlined-text-field
          id="appcat"
          label="Category"
          value="Bus Protection"
        >
        </md-outlined-text-field>
        <md-outlined-text-field
          id="appname"
          label="Name"
          value="Protection 2 (7SS85) to MUs"
        >
        </md-outlined-text-field>
        <md-outlined-text-field
          id="appdesc"
          label="Description"
          value="Configure MUs and Bus Protection"
        >
        </md-outlined-text-field>
        <md-outlined-text-field
          id="appver"
          label="Version"
          value="1.0.0"
        ></md-outlined-text-field>
        <md-outlined-text-field
          id="appverdesc"
          label="Version Description"
          value="Something version specific"
        >
        </md-outlined-text-field>
        <label id="deprecated">
          <md-checkbox id="appdeprecated" touch-target="wrapper"></md-checkbox>
          Deprecated
        </label>
      </div>
      <div class="group">
        <md-filled-button
          class="button"
          @click=${() => this.iedTemplateSelectorUI.show()}
          >Add IEDs
          <md-icon slot="icon">developer_board</md-icon>
        </md-filled-button>
      </div>
      ${this.templateCreationStage >= 1
        ? this.renderCbSelectionTable()
        : nothing}
      ${this.templateCreationStage >= 2
        ? this.renderIedsToFunctionNaming()
        : nothing}
      ${this.templateCreationStage >= 3 ? this.renderOutputJSON() : nothing}
    `;
  }

  renderTemplateIedsSelector(): TemplateResult {
    return html`<md-dialog
      id="selection-dialog"
      @cancel=${(event: Event) => {
        event.preventDefault();
        // this.clearSelection();
      }}
    >
      <div slot="headline">Select IEDs to create a template mapping</div>
      <form slot="content" id="selection" method="dialog">
        <selection-list
          id="selection-list"
          .items=${Array.from(this.doc?.querySelectorAll('IED') ?? []).map(
            ied => {
              const { firstLine, secondLine } = getIedDescription(ied);

              return {
                headline: `${ied.getAttribute('name')!} — ${firstLine}`,
                supportingText: secondLine,
                attachedElement: ied,
                selected: false
              };
            }
          )}
          filterable
        ></selection-list>
      </form>
      <div slot="actions">
        <md-text-button
          @click="${() => {
            this.iedTemplateSelectorUI.close();
            this.clearIedTemplateSelection();
          }}"
          >Cancel</md-text-button
        >
        <md-text-button
          @click="${() => {
            const ieds: Element[] = this.selectionListUI.selectedElements;
            this.clearIedTemplateSelection();

            const iedNames = ieds.map(ied => ied.getAttribute('name'));

            const iedCombinations = Array.from(combinations(iedNames, 2));

            this.iedMappingStencilData = [];
            iedCombinations.forEach(iedPairs => {
              // A to B
              const aDir = getMappingInfo(this.doc, iedPairs[0]!, iedPairs[1]!);
              this.iedMappingStencilData.push(...aDir);

              // B to A
              const bDir = getMappingInfo(this.doc, iedPairs[1]!, iedPairs[0]!);
              this.iedMappingStencilData.push(...bDir);
            });

            this.templateCreationStage = 1;
          }}"
          form="selection"
          >Add IEDs</md-text-button
        >
      </div></md-dialog
    >`;
  }

  renderView(): TemplateResult {
    return this.renderOutputJSON();
  }

  render(): TemplateResult {
    return html`<mwc-tab-bar
        @MDCTabBar:activated=${({
          detail: { index }
        }: {
          detail: { index: number };
        }) => {
          this.tabIndex = index;
        }}
      >
        <mwc-tab label="Use" icon="play_circle" default></mwc-tab>
        <mwc-tab label="Create" icon="construction"></mwc-tab>
        <mwc-tab label="View" icon="frame_source"></mwc-tab>
      </mwc-tab-bar>
      <section>
        ${this.tabIndex === 0 ? this.renderUse() : nothing}
        ${this.tabIndex === 1 ? this.renderCreate() : nothing}
        ${this.tabIndex === 2 ? this.renderView() : nothing}
      </section>
      ${this.renderTemplateIedsSelector()} ${this.renderFunctionIedSelector()}`;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;

      --secondaryThemeFallback: #018786;
      --scrollbarBG: var(--mdc-theme-background, #cfcfcf00);
      --thumbBG: var(--mdc-button-disabled-ink-color, #996cd8cc);
    }

    h1,
    h2,
    h3 {
      color: var(--mdc-theme-on-surface);
      font-family: 'Roboto', sans-serif;
      font-weight: 300;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      margin: 0px;
      line-height: 48px;
      padding-left: 0.3em;
    }

    p {
      color: var(--mdc-theme-on-surface);
      font-family: 'Roboto', sans-serif;
      font-weight: 300;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      margin: 0px;
      padding-left: 0.3em;
    }

    label {
      color: var(--mdc-theme-on-surface);
      font-family: 'Roboto', sans-serif;
      font-weight: normal;
    }

    mwc-tab-bar,
    #output {
      width: 100%;
      display: block;
      margin-top: 20px;
      --md-outlined-text-field-input-text-font: 'Roboto Mono';
    }

    #stencilName {
      width: 100%;
    }

    #appname,
    #appdesc,
    #stendesc {
      width: 400px;
    }

    #applications,
    #iedsAndFunctions {
      width: 500px;
    }

    #applications {
      height: 100%;
    }

    #stencilVersion {
      padding: 10px;
    }

    #changeStencil {
      display: none;
    }

    .iedfunction {
      width: 300px;
      min-width: 250px;
    }

    #appMaker {
      display: flex;
      flex-direction: row;
    }

    #headline,
    #deprecated {
      display: flex;
      align-items: center;
    }

    .button,
    .appinf > md-outlined-text-field {
      margin: 10px;
    }

    .group {
      display: flex;
      flex-direction: row;
    }

    .appIed {
      margin: 15px;
    }

    #appMenuHeader {
      display: flex;
      justify-content: space-between;
    }

    md-list-item.selected {
      background-color: var(--thumbBG);
    }

    .menu-item {
      display: inline-flex;
      align-items: center;
    }

    section {
      position: relative;
      max-height: 100%;
      background-color: var(--mdc-theme-surface, #fafafa);
      padding: 12px;
    }

    table {
      position: relative;
      border-collapse: collapse;
      border: 2px solid rgb(140 140 140);
      color: var(--mdc-theme-on-surface);
      font-family: 'Roboto', sans-serif;
      font-weight: normal;
      padding: 12px;
      /* font-size: 0.8rem; */
      letter-spacing: 1px;
    }

    caption {
      caption-side: bottom;
      padding: 10px;
      font-weight: bold;
    }

    thead,
    tfoot {
      background-color: var(--mdc-theme-surface, #fafafa);
    }

    th.stay[scope='col'] {
      position: sticky;
      top: 60px;
      background-color: var(--mdc-theme-surface, #fafafa);
      padding: 5px 10px;
    }

    th,
    td {
      border: 1px solid rgb(160 160 160);
      padding: 3px 3px 5px 5px;
    }

    td:last-of-type {
      text-align: center;
    }

    .mapcell {
      text-align: center;
    }

    .cbname {
      text-align: left;
      font-weight: 300;
      padding-left: 20px;
      padding-right: 20px;
      position: sticky;
      left: 0px;
    }

    .iedname {
      text-align: left;
      padding-left: 5px;
      padding-right: 5px;
    }

    tbody > tr:nth-of-type(even) {
      background-color: rgb(237 238 242);
    }
  `;
}
