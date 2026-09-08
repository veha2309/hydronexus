"""Generate a small, explicitly synthetic CF NetCDF fixture for the import demo."""
from pathlib import Path
import numpy as np
import xarray as xr

lat=np.linspace(5,22,12)
lon=np.linspace(80,95,14)
depth=np.array([0,10,25,50,75,100,150,200,300,500,700,1000,1500,2000])
time=np.array(['2026-09-07T00:00','2026-09-07T06:00','2026-09-07T12:00'],dtype='datetime64[ns]')
t,z,y,x=np.meshgrid(np.arange(len(time))*6,depth,lat,lon,indexing='ij')
phase=t/24
eddy=np.sin((x-80)/3+phase)*np.cos((y-12)/4)
surface=28.8+1.1*np.sin((x-76)/8)-.04*y+.35*np.sin(phase)
temperature=3.5+(surface-3.5)*np.exp(-z/((95+22*eddy)*4))+eddy*.4*np.exp(-z/500)
salinity=34.8+1.3*np.cos((x-68)/12)*np.exp(-z/220)+eddy*.13
u=(.34*np.cos((y-10)/3+phase)+.12)*np.exp(-z/1100)
v=.38*np.sin((x-82)/4+phase/2)*np.exp(-z/1100)
dims=('time','depth','latitude','longitude')
ds=xr.Dataset({'temperature':(dims,temperature,{'units':'degree_Celsius','standard_name':'sea_water_temperature'}),'salinity':(dims,salinity,{'units':'PSU','standard_name':'sea_water_salinity'}),'u':(dims,u,{'units':'m/s','standard_name':'eastward_sea_water_velocity'}),'v':(dims,v,{'units':'m/s','standard_name':'northward_sea_water_velocity'})},coords={'time':time,'depth':depth,'latitude':lat,'longitude':lon},attrs={'Conventions':'CF-1.8','title':'HydroNexus SYNTHETIC demonstration fixture','hydronexus_synthetic':1})
ds.depth.attrs={'units':'m','positive':'down','standard_name':'depth','axis':'Z'}
ds.latitude.attrs={'units':'degrees_north','standard_name':'latitude','axis':'Y'}
ds.longitude.attrs={'units':'degrees_east','standard_name':'longitude','axis':'X'}
ds.time.attrs={'standard_name':'time','axis':'T'}
target=Path(__file__).resolve().parent.parent/'public'/'sample-model.nc'
ds.to_netcdf(target)
print(f'Wrote synthetic model to {target}')
