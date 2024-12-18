import {
  controlBlockObjRef,
  identity,
  matchDataAttributes
} from '@openenergytools/scl-lib';

export type Mapping = {
  ExtRef: string;
  FCDA: string;
};

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
  selSupervision?: {
    ExtRef: string;
    name: string;
  };
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
 * Excludes the service type match.
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

function isSELMessageQuality(extRef: Element) {
  const toIed = extRef.closest('IED')!;
  const isSEL = toIed && toIed.getAttribute('manufacturer') === 'SEL';
  const hasNoServiceType =
    !extRef.getAttribute('serviceType') ||
    extRef.getAttribute('serviceType') === '';
  return isSEL && hasNoServiceType && !isSubscribed(extRef);
}

function findSELMessageQuality(
  control: Element,
  toIedName: string
): Element | undefined {
  const doc = control.ownerDocument;
  const fromIedName = control.closest('IED')!.getAttribute('name')!;

  return Array.from(
    doc.querySelectorAll(
      `:root>IED[name="${toIedName}"]>AccessPoint>Server>LDevice>LN0>Inputs>ExtRef[iedName="${fromIedName}"], 
      :root>IED[name="${toIedName}"]>AccessPoint>Server>LDevice>LN>Inputs>ExtRef[iedName="${fromIedName}"]`
    )
  ).find(
    extRef =>
      matchSrcAttributes(extRef, control) &&
      !isSubscribed(extRef) &&
      isSELMessageQuality(extRef)
  );
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

/** @returns all ExtRef element subscribed to a control block element for a specific subscribing IED */
function findControlBlockSubscription(
  control: Element,
  toIedName: string
): Element[] {
  const doc = control.ownerDocument;
  const fromIedName = control.closest('IED')?.getAttribute('name');

  return Array.from(
    doc.querySelectorAll(
      `:root>IED[name="${toIedName}"]>AccessPoint>Server>LDevice>LN0>Inputs>ExtRef[iedName="${fromIedName}"], 
      :root>IED[name="${toIedName}"]>AccessPoint>Server>LDevice>LN>Inputs>ExtRef[iedName="${fromIedName}"]`
    )
  ).filter(extRef => matchSrcAttributes(extRef, control));
}

export function getMappingInfo(
  doc: XMLDocument,
  fromName: string,
  toName: string,
  includeSELSupervision = true
): ControlBlockInfo[] {
  const fromIed = doc.querySelector(`:root > IED[name="${fromName}"`)!;

  const controlBlocks = Array.from(
    fromIed.querySelectorAll('GSEControl, SampledValueControl')
  );

  const cbMappings: ControlBlockInfo[] = [];

  controlBlocks.forEach((cb: Element) => {
    const extRefMappings = findControlBlockSubscription(cb, toName)
      .filter(extRef => {
        const iedNameMatch =
          extRef.closest('IED')!.getAttribute('name') === toName;
        return iedNameMatch && isSubscribed(extRef);
      })
      .map(extRef => ({
        FCDA: identityNoIed(getFCDA(cb, extRef) ?? null, fromName),
        ExtRef: identityNoIed(extRef, toName)
      }));

    if (extRefMappings.length) {
      const toIed = doc.querySelector(`:root > IED[name="${toName}"`)!;
      const supLn = findSupervision(cb, toIed) ?? null;

      let selSupervision;
      if (includeSELSupervision) {
        // this is not especially efficient
        const selMqExtRef = findSELMessageQuality(cb, toName);
        selSupervision = selMqExtRef
          ? {
              name:
                selMqExtRef.getAttribute('intAddr') ?? 'No internal address!!',
              ExtRef: identityNoIed(selMqExtRef, toName)
            }
          : undefined;
      }

      cbMappings.push({
        id: `${identityNoIed(cb, fromName)}`,
        name: cb.getAttribute('name')!,
        from: fromName,
        to: toName,
        type: cb.tagName,
        mappings: extRefMappings,
        supervision: supLn ? `${identityNoIed(supLn, toName)}` : 'None',
        ...(includeSELSupervision && selSupervision && { selSupervision })
      });
    }
  });
  return cbMappings;
}
