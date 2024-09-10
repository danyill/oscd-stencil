import {
  controlBlockObjRef,
  identity,
  matchDataAttributes
} from '@openenergytools/scl-lib';

export type MappingBase = {
  ExtRef: string;
};

// Either there is a mapped FCDA or SEL Message Quality, never both
type Mapping =
  | (MappingBase & { FCDA: string; SELMessageQuality?: never })
  | (MappingBase & { FCDA?: never; SELMessageQuality: string });

export type ControlBlockInfo = {
  id: string;
  name: string;
  from: string;
  to: string;
  baseFrom?: string;
  baseTo?: string;
  type: string;
  mappings: Mapping[];
  supervision: string;
};

const serviceType: Partial<Record<string, string>> = {
  GSEControl: 'GOOSE',
  SampledValueControl: 'SMV',
  ReportControl: 'Report'
};

/**
 * Check if the ExtRef is already subscribed to a FCDA Element.
 *
 * @param extRef - The Ext Ref Element to check.
 */
function isSubscribed(extRef: Element): boolean {
  return (
    extRef.hasAttribute('iedName') &&
    extRef.hasAttribute('ldInst') &&
    extRef.hasAttribute('lnClass') &&
    extRef.hasAttribute('lnInst') &&
    extRef.hasAttribute('doName')
  );
}

/**
 * A near copy of the same function in scl-lib.
 */
export function matchSrcAttributes(extRef: Element, control: Element): boolean {
  const cbName = control.getAttribute('name');
  const srcLDInst = control.closest('LDevice')?.getAttribute('inst');
  const srcPrefix = control.closest('LN0, LN')?.getAttribute('prefix') ?? '';
  const srcLNClass = control.closest('LN0, LN')?.getAttribute('lnClass');
  const srcLNInst = control.closest('LN0, LN')?.getAttribute('inst');

  const extRefSrcLNClass = extRef.getAttribute('srcLNClass');
  const srcLnClassCheck =
    !extRefSrcLNClass || extRefSrcLNClass === ''
      ? srcLNClass === 'LLN0'
      : extRefSrcLNClass === srcLNClass;

  const extRefSrcLDInst = extRef.getAttribute('srcLDInst');
  const srcLdInstCheck =
    !extRefSrcLDInst || extRefSrcLDInst === ''
      ? extRef.getAttribute('ldInst') === srcLDInst
      : extRefSrcLDInst === srcLDInst;

  return (
    (extRef.getAttribute('srcCBName') === cbName &&
      srcLdInstCheck &&
      (extRef.getAttribute('srcPrefix') ?? '') === srcPrefix &&
      (extRef.getAttribute('srcLNInst') ?? '') === srcLNInst &&
      srcLnClassCheck &&
      extRef.getAttribute('serviceType') === serviceType[control.tagName]) ||
    !extRef.getAttribute('serviceType')
  );
}

/**
 * A near copy of the same function in scl-lib.
 */
function findControlBlockSubscriptionOrSelMq(control: Element): Element[] {
  const doc = control.ownerDocument;
  const iedName = control.closest('IED')?.getAttribute('name');

  return Array.from(
    doc.querySelectorAll(`ExtRef[iedName="${iedName}"]`)
  ).filter(extRef => matchSrcAttributes(extRef, control));
}

function getFCDA(cb: Element, extRef: Element): Element | undefined {
  const dsName = cb.getAttribute('datSet');
  const ds = cb.closest('LN0')!.querySelector(`DataSet[name="${dsName}"]`);
  return Array.from(ds!.querySelectorAll('FCDA')).find((fcda: Element) =>
    matchDataAttributes(extRef, fcda)
  );
}

function findSupervision(cb: Element, ied: Element): Element | undefined {
  const lnClass = cb.tagName === 'GSEControl' ? 'LGOS' : 'LSVS';
  const cbRefType = lnClass === 'LGOS' ? 'GoCBRef' : 'SvCBRef';

  return (
    Array.from(
      ied.querySelectorAll(
        `LN[lnClass="${lnClass}"] > DOI[name="${cbRefType}"] > DAI[name="setSrcRef"] > Val`
      )
    )
      .find(val => val.textContent === controlBlockObjRef(cb))
      ?.closest('LN') ?? undefined
  );
}

function identityNoIed(element: Element | null, iedName: string): string {
  if (element === null) return 'NONE';
  return `${identity(element)}`.substring(iedName.length);
}

function isSELMessageQuality(extRef: Element, toIedName: string) {
  const toIed = extRef.ownerDocument.querySelector(
    `:root > IED[name="${toIedName}"]`
  );
  const isSEL = toIed && toIed.getAttribute('manufacturer') === 'SEL';
  const hasNoServiceType =
    !extRef.getAttribute('serviceType') ||
    extRef.getAttribute('serviceType') === '';
  return isSEL && hasNoServiceType && !isSubscribed(extRef);
}

export function getMappingInfo(
  doc: XMLDocument,
  fromName: string,
  toName: string
): ControlBlockInfo[] {
  const fromIed = doc.querySelector(`:root > IED[name="${fromName}"`)!;

  const controlBlocks = Array.from(
    fromIed.querySelectorAll('GSEControl, SampledValueControl')
  );

  const cbMappings: ControlBlockInfo[] = [];

  controlBlocks.forEach((cb: Element) => {
    const extRefMappings = findControlBlockSubscriptionOrSelMq(cb)
      .filter(extRef => {
        const iedNameMatch =
          extRef.closest('IED')!.getAttribute('name') === toName;
        return (
          iedNameMatch &&
          (isSubscribed(extRef) || isSELMessageQuality(extRef, toName))
        );
      })
      .map(extRef => {
        const selMq = isSELMessageQuality(extRef, toName);

        if (!selMq) {
          return {
            FCDA: identityNoIed(getFCDA(cb, extRef) ?? null, fromName),
            ExtRef: identityNoIed(extRef, toName)
          };
        }
        return {
          ExtRef: identityNoIed(extRef, toName),
          SELMessageQuality:
            extRef.getAttribute('intAddr') ?? 'No internal address found!'
        };
      });
    if (extRefMappings.length) {
      const toIed = doc.querySelector(`:root > IED[name="${toName}"`)!;
      const supLn = findSupervision(cb, toIed) ?? null;

      cbMappings.push({
        id: `${identityNoIed(cb, fromName)}`,
        name: cb.getAttribute('name')!,
        from: fromName,
        to: toName,
        type: cb.tagName,
        mappings: extRefMappings,
        supervision: supLn ? `${identityNoIed(supLn, toName)}` : 'None'
      });
    }
  });
  return cbMappings;
}
