let watermarkPrinted = false

export const printWatermark = () => {
	if (watermarkPrinted) return
	watermarkPrinted = true

	console.log(`
============================================================
  iRexusTyps - WhatsApp Web API
  Remake of WhiskeySockets
  https://github.com/iReexus/iRexusTyps
============================================================`)
}
